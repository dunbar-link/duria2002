update public.dl_graph_expansion_candidates
set
  bridge_pid = null,
  metadata = coalesce(metadata, '{}'::jsonb) - 'bridgePid'
where right(coalesce(bridge_pid, ''), 1) = ':'
   or right(coalesce(metadata ->> 'bridgePid', ''), 1) = ':';

update public.dl_graph_expansion_candidates
set
  bridge_pid = nullif(metadata ->> 'bridge_pid', ''),
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('bridgePid', nullif(metadata ->> 'bridge_pid', ''))
where coalesce(nullif(metadata ->> 'bridge_pid', ''), '') <> '';

create or replace function public.dl_execute_graph_expansion_seed(
  p_candidate_id uuid,
  p_owner_user_id uuid,
  p_seed_cost integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_existing_edge record;
  v_wallet record;

  v_bridge_pid text;
  v_target_pid text;
  v_target_name text;
  v_edge_label text;
  v_trust integer;
  v_tier integer;

  v_balance_before integer := 0;
  v_balance_after integer := 0;

  v_charge_attempted boolean := false;
  v_charge_success boolean := false;
  v_seed_attempted boolean := false;
  v_seed_success boolean := false;

  v_edge_id uuid;
  v_error text := null;
  v_now timestamptz := now();
begin
  select *
  into v_candidate
  from public.dl_graph_expansion_candidates
  where id = p_candidate_id
    and owner_user_id = p_owner_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'status', 'failed',
      'reason', 'candidate_not_found',
      'candidateId', p_candidate_id,
      'chargeAttempted', false,
      'chargeSuccess', false,
      'seedAttempted', false,
      'seedSuccess', false,
      'coinCost', 0,
      'balanceBefore', null,
      'balanceAfter', null,
      'error', null
    );
  end if;

  v_bridge_pid := coalesce(
    case
      when right(coalesce(v_candidate.bridge_pid, ''), 1) = ':' then null
      else nullif(v_candidate.bridge_pid, '')
    end,
    case
      when right(coalesce(v_candidate.metadata ->> 'bridgePid', ''), 1) = ':' then null
      else nullif(v_candidate.metadata ->> 'bridgePid', '')
    end,
    nullif(v_candidate.metadata ->> 'bridge_pid', ''),
    case
      when nullif(v_candidate.bridge_candidate_id_key, '') is not null
       and v_candidate.owner_user_id is not null
      then concat('bridge:', v_candidate.owner_user_id::text, ':', v_candidate.bridge_candidate_id_key)
      else null
    end
  );

  v_target_pid := coalesce(
    nullif(v_candidate.target_pid, ''),
    nullif(v_candidate.metadata ->> 'targetPid', ''),
    nullif(v_candidate.metadata ->> 'target_pid', '')
  );

  v_target_name := coalesce(
    nullif(v_candidate.target_name, ''),
    nullif(v_candidate.metadata ->> 'targetName', ''),
    nullif(v_candidate.metadata ->> 'target_name', ''),
    'Unknown'
  );

  v_edge_label := coalesce(
    nullif(v_candidate.edge_label, ''),
    nullif(v_candidate.metadata ->> 'edgeLabel', ''),
    nullif(v_candidate.metadata ->> 'edge_label', ''),
    'graph_expansion_bridge'
  );

  v_trust := coalesce(
    v_candidate.trust,
    nullif(v_candidate.metadata ->> 'trust', '')::integer,
    70
  );

  v_tier := coalesce(
    v_candidate.tier,
    nullif(v_candidate.metadata ->> 'tier', '')::integer,
    50
  );

  if v_bridge_pid is null or v_target_pid is null then
    update public.dl_graph_expansion_candidates
    set last_execution_log = jsonb_build_object(
      'source', 'seed_rpc',
      'mode', 'execute',
      'decision', 'fail',
      'reason', 'invalid_seed_payload',
      'candidateId', p_candidate_id,
      'bridgePid', v_bridge_pid,
      'targetPid', v_target_pid,
      'targetName', v_target_name,
      'coinCost', 0,
      'chargeAttempted', false,
      'chargeSuccess', false,
      'seedAttempted', false,
      'seedSuccess', false,
      'balanceBefore', null,
      'balanceAfter', null,
      'error', 'bridge_pid_or_target_pid_missing',
      'executedAt', v_now
    )
    where id = p_candidate_id;

    return jsonb_build_object(
      'ok', false,
      'status', 'failed',
      'reason', 'invalid_seed_payload',
      'candidateId', p_candidate_id,
      'bridgePid', v_bridge_pid,
      'targetPid', v_target_pid,
      'targetName', v_target_name,
      'trust', v_trust,
      'tier', v_tier,
      'edgeLabel', v_edge_label,
      'chargeAttempted', false,
      'chargeSuccess', false,
      'seedAttempted', false,
      'seedSuccess', false,
      'coinCost', 0,
      'balanceBefore', null,
      'balanceAfter', null,
      'error', 'bridge_pid_or_target_pid_missing'
    );
  end if;

  update public.dl_graph_expansion_candidates
  set
    bridge_pid = v_bridge_pid,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('bridgePid', v_bridge_pid)
      || jsonb_build_object('bridge_pid', v_bridge_pid)
  where id = p_candidate_id;

  insert into public.dl_wallet_balances (user_id, balance)
  values (p_owner_user_id, 0)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from public.dl_wallet_balances
  where user_id = p_owner_user_id
  for update;

  v_balance_before := coalesce(v_wallet.balance, 0);
  v_balance_after := v_balance_before;

  select *
  into v_existing_edge
  from public.dl_edges
  where from_pid = v_bridge_pid
    and to_pid = v_target_pid
    and label = v_edge_label
  limit 1;

  if found then
    update public.dl_graph_expansion_candidates
    set
      status = 'seeded',
      bridge_pid = v_bridge_pid,
      last_execution_log = jsonb_build_object(
        'source', 'seed_rpc',
        'mode', 'execute',
        'decision', 'reuse',
        'reason', 'duplicate_edge_reused',
        'candidateId', p_candidate_id,
        'bridgePid', v_bridge_pid,
        'targetPid', v_target_pid,
        'targetName', v_target_name,
        'coinCost', 0,
        'chargeAttempted', false,
        'chargeSuccess', false,
        'seedAttempted', true,
        'seedSuccess', true,
        'balanceBefore', v_balance_before,
        'balanceAfter', v_balance_before,
        'edgeId', v_existing_edge.id,
        'executedAt', v_now
      ),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'bridgePid', v_bridge_pid,
        'bridge_pid', v_bridge_pid,
        'seed_result', jsonb_build_object(
          'reason', 'duplicate_edge_reused',
          'edgeId', v_existing_edge.id,
          'fromPid', v_bridge_pid,
          'toPid', v_target_pid,
          'label', v_edge_label,
          'trust', v_trust,
          'tier', v_tier,
          'seeded_at', v_now,
          'coinCost', 0,
          'balanceBefore', v_balance_before,
          'balanceAfter', v_balance_before
        )
      )
    where id = p_candidate_id;

    return jsonb_build_object(
      'ok', true,
      'status', 'success',
      'reason', 'duplicate_edge_reused',
      'candidateId', p_candidate_id,
      'bridgePid', v_bridge_pid,
      'targetPid', v_target_pid,
      'targetName', v_target_name,
      'trust', v_trust,
      'tier', v_tier,
      'edgeLabel', v_edge_label,
      'chargeAttempted', false,
      'chargeSuccess', false,
      'seedAttempted', true,
      'seedSuccess', true,
      'coinCost', 0,
      'balanceBefore', v_balance_before,
      'balanceAfter', v_balance_before,
      'error', null
    );
  end if;

  if v_balance_before < p_seed_cost then
    update public.dl_graph_expansion_candidates
    set last_execution_log = jsonb_build_object(
      'source', 'seed_rpc',
      'mode', 'execute',
      'decision', 'fail',
      'reason', 'insufficient_funds',
      'candidateId', p_candidate_id,
      'bridgePid', v_bridge_pid,
      'targetPid', v_target_pid,
      'targetName', v_target_name,
      'coinCost', p_seed_cost,
      'chargeAttempted', true,
      'chargeSuccess', false,
      'seedAttempted', false,
      'seedSuccess', false,
      'balanceBefore', v_balance_before,
      'balanceAfter', v_balance_before,
      'error', null,
      'executedAt', v_now
    )
    where id = p_candidate_id;

    return jsonb_build_object(
      'ok', false,
      'status', 'failed',
      'reason', 'insufficient_funds',
      'candidateId', p_candidate_id,
      'bridgePid', v_bridge_pid,
      'targetPid', v_target_pid,
      'targetName', v_target_name,
      'trust', v_trust,
      'tier', v_tier,
      'edgeLabel', v_edge_label,
      'chargeAttempted', true,
      'chargeSuccess', false,
      'seedAttempted', false,
      'seedSuccess', false,
      'coinCost', p_seed_cost,
      'balanceBefore', v_balance_before,
      'balanceAfter', v_balance_before,
      'error', null
    );
  end if;

  begin
    v_charge_attempted := true;

    update public.dl_wallet_balances
    set
      balance = balance - p_seed_cost,
      updated_at = now()
    where user_id = p_owner_user_id
    returning balance into v_balance_after;

    insert into public.dl_wallet_ledger (
      user_id,
      amount,
      balance_before,
      balance_after,
      reason,
      ref_type,
      ref_id,
      metadata
    )
    values (
      p_owner_user_id,
      -p_seed_cost,
      v_balance_before,
      v_balance_after,
      'graph_expansion_seed',
      'candidate',
      p_candidate_id,
      jsonb_build_object(
        'candidateId', p_candidate_id,
        'bridgePid', v_bridge_pid,
        'targetPid', v_target_pid,
        'targetName', v_target_name,
        'edgeLabel', v_edge_label
      )
    );

    v_charge_success := true;
    v_seed_attempted := true;

    insert into public.dl_edges (
      from_pid,
      to_pid,
      trust,
      tier,
      status,
      label
    )
    values (
      v_bridge_pid,
      v_target_pid,
      v_trust,
      v_tier,
      'accepted',
      v_edge_label
    )
    returning id into v_edge_id;

    v_seed_success := true;
  exception
    when others then
      v_error := sqlerrm;
      v_charge_success := false;
      v_seed_success := false;
      v_balance_after := v_balance_before;
  end;

  if not v_seed_success then
    select *
    into v_existing_edge
    from public.dl_edges
    where from_pid = v_bridge_pid
      and to_pid = v_target_pid
      and label = v_edge_label
    limit 1;

    if found then
      update public.dl_graph_expansion_candidates
      set
        status = 'seeded',
        bridge_pid = v_bridge_pid,
        last_execution_log = jsonb_build_object(
          'source', 'seed_rpc',
          'mode', 'execute',
          'decision', 'reuse',
          'reason', 'duplicate_edge_reused',
          'candidateId', p_candidate_id,
          'bridgePid', v_bridge_pid,
          'targetPid', v_target_pid,
          'targetName', v_target_name,
          'coinCost', 0,
          'chargeAttempted', false,
          'chargeSuccess', false,
          'seedAttempted', true,
          'seedSuccess', true,
          'balanceBefore', v_balance_before,
          'balanceAfter', v_balance_before,
          'edgeId', v_existing_edge.id,
          'executedAt', now()
        ),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'bridgePid', v_bridge_pid,
          'bridge_pid', v_bridge_pid,
          'seed_result', jsonb_build_object(
            'reason', 'duplicate_edge_reused',
            'edgeId', v_existing_edge.id,
            'fromPid', v_bridge_pid,
            'toPid', v_target_pid,
            'label', v_edge_label,
            'trust', v_trust,
            'tier', v_tier,
            'seeded_at', now(),
            'coinCost', 0,
            'balanceBefore', v_balance_before,
            'balanceAfter', v_balance_before
          )
        )
      where id = p_candidate_id;

      return jsonb_build_object(
        'ok', true,
        'status', 'success',
        'reason', 'duplicate_edge_reused',
        'candidateId', p_candidate_id,
        'bridgePid', v_bridge_pid,
        'targetPid', v_target_pid,
        'targetName', v_target_name,
        'trust', v_trust,
        'tier', v_tier,
        'edgeLabel', v_edge_label,
        'chargeAttempted', false,
        'chargeSuccess', false,
        'seedAttempted', true,
        'seedSuccess', true,
        'coinCost', 0,
        'balanceBefore', v_balance_before,
        'balanceAfter', v_balance_before,
        'error', null
      );
    end if;

    update public.dl_graph_expansion_candidates
    set last_execution_log = jsonb_build_object(
      'source', 'seed_rpc',
      'mode', 'execute',
      'decision', 'fail',
      'reason', 'seed_transaction_failed',
      'candidateId', p_candidate_id,
      'bridgePid', v_bridge_pid,
      'targetPid', v_target_pid,
      'targetName', v_target_name,
      'coinCost', p_seed_cost,
      'chargeAttempted', v_charge_attempted,
      'chargeSuccess', false,
      'seedAttempted', true,
      'seedSuccess', false,
      'balanceBefore', v_balance_before,
      'balanceAfter', v_balance_before,
      'error', v_error,
      'executedAt', now()
    )
    where id = p_candidate_id;

    return jsonb_build_object(
      'ok', false,
      'status', 'failed',
      'reason', 'seed_transaction_failed',
      'candidateId', p_candidate_id,
      'bridgePid', v_bridge_pid,
      'targetPid', v_target_pid,
      'targetName', v_target_name,
      'trust', v_trust,
      'tier', v_tier,
      'edgeLabel', v_edge_label,
      'chargeAttempted', v_charge_attempted,
      'chargeSuccess', false,
      'seedAttempted', true,
      'seedSuccess', false,
      'coinCost', p_seed_cost,
      'balanceBefore', v_balance_before,
      'balanceAfter', v_balance_before,
      'error', v_error
    );
  end if;

  update public.dl_graph_expansion_candidates
  set
    status = 'seeded',
    bridge_pid = v_bridge_pid,
    last_execution_log = jsonb_build_object(
      'source', 'seed_rpc',
      'mode', 'execute',
      'decision', 'seed',
      'reason', 'seeded',
      'candidateId', p_candidate_id,
      'bridgePid', v_bridge_pid,
      'targetPid', v_target_pid,
      'targetName', v_target_name,
      'coinCost', p_seed_cost,
      'chargeAttempted', v_charge_attempted,
      'chargeSuccess', v_charge_success,
      'seedAttempted', v_seed_attempted,
      'seedSuccess', v_seed_success,
      'balanceBefore', v_balance_before,
      'balanceAfter', v_balance_after,
      'edgeId', v_edge_id,
      'executedAt', now()
    ),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'bridgePid', v_bridge_pid,
      'bridge_pid', v_bridge_pid,
      'seed_result', jsonb_build_object(
        'reason', 'seeded',
        'edgeId', v_edge_id,
        'fromPid', v_bridge_pid,
        'toPid', v_target_pid,
        'label', v_edge_label,
        'trust', v_trust,
        'tier', v_tier,
        'seeded_at', now(),
        'coinCost', p_seed_cost,
        'balanceBefore', v_balance_before,
        'balanceAfter', v_balance_after
      )
    )
  where id = p_candidate_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'success',
    'reason', 'seeded',
    'candidateId', p_candidate_id,
    'bridgePid', v_bridge_pid,
    'targetPid', v_target_pid,
    'targetName', v_target_name,
    'trust', v_trust,
    'tier', v_tier,
    'edgeLabel', v_edge_label,
    'chargeAttempted', v_charge_attempted,
    'chargeSuccess', v_charge_success,
    'seedAttempted', v_seed_attempted,
    'seedSuccess', v_seed_success,
    'coinCost', p_seed_cost,
    'balanceBefore', v_balance_before,
    'balanceAfter', v_balance_after,
    'error', null
  );
end;
$$;

grant execute on function public.dl_execute_graph_expansion_seed(uuid, uuid, integer) to authenticated;
grant execute on function public.dl_execute_graph_expansion_seed(uuid, uuid, integer) to service_role;