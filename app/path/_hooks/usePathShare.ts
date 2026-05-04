"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import {
  dataUrlToBlob,
  downloadBlob,
  slugifyFileName,
} from "../_lib/path-helpers";

type UsePathShareParams = {
  cardRef: RefObject<HTMLDivElement | null>;
  resolvedTargetName: string;
  hops: number | null;
  shareHref: string;
};

type UsePathShareReturn = {
  sharing: boolean;
  actionMessage: string;
  handleSmartShare: () => Promise<void>;
};

export function usePathShare({
  cardRef,
  resolvedTargetName,
  hops,
  shareHref,
}: UsePathShareParams): UsePathShareReturn {
  const [sharing, setSharing] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    if (!actionMessage) return;

    const timer = setTimeout(() => setActionMessage(""), 2200);
    return () => clearTimeout(timer);
  }, [actionMessage]);

  const createCardBlob = useCallback(async () => {
    const node = cardRef.current;

    if (!node) {
      throw new Error("Share card node not found");
    }

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const htmlToImage = await import("html-to-image");

    const dataUrl = await htmlToImage.toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });

    return dataUrlToBlob(dataUrl);
  }, [cardRef]);

  const handleSmartShare = useCallback(async () => {
    try {
      setSharing(true);

      const blob = await createCardBlob();
      const fileName = `${slugifyFileName(resolvedTargetName)}-${
        typeof hops === "number" ? hops : "share"
      }-steps.png`;

      const file = new File([blob], fileName, {
        type: "image/png",
      });

      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };

      if (typeof nav.share === "function") {
        const shareText = `나는 ${resolvedTargetName}까지 ${
          typeof hops === "number" ? `${hops}단계` : "연결 확인 중"
        }입니다.`;

        const fileShareData: ShareData = {
          title: "Dunbar Link",
          text: shareText,
          files: [file],
        };

        if (typeof nav.canShare === "function" && nav.canShare(fileShareData)) {
          await nav.share(fileShareData);
          setActionMessage("공유창을 열었습니다");
          return;
        }

        await nav.share({
          title: "Dunbar Link",
          text: shareText,
          url: shareHref,
        });

        downloadBlob(blob, fileName);
        setActionMessage("공유창을 열고 이미지 파일도 저장했습니다");
        return;
      }

      downloadBlob(blob, fileName);
      setActionMessage("공유창 미지원 환경이라 이미지 저장으로 대체했습니다");
    } catch (error) {
      console.error(error);
      setActionMessage("공유를 완료하지 못했습니다");
    } finally {
      setSharing(false);
    }
  }, [createCardBlob, resolvedTargetName, hops, shareHref]);

  return {
    sharing,
    actionMessage,
    handleSmartShare,
  };
}