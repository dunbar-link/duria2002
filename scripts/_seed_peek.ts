import fs from "fs";
import path from "path";

const seedDir = path.resolve(process.cwd(), "seed");
const files = [
  "edges_kr_core.csv",
  "edges_kr_autogen.csv",
  "edges_univ_to_company.csv",
  "edges_celebrity_seed.csv",
];

function hexPrefix(buf: Buffer, n = 24) {
  return Array.from(buf.slice(0, n))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

function preview(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.log("❌ missing:", filePath);
    return;
  }

  const buf = fs.readFileSync(filePath);
  const text = buf.toString("utf8");

  console.log("\n==============================");
  console.log("FILE:", path.basename(filePath));
  console.log("SIZE:", buf.length, "bytes");
  console.log("HEX(0..24):", hexPrefix(buf));
  console.log("FIRST 5 LINES:");
  const lines = text.split(/\r?\n/).slice(0, 5);
  for (let i = 0; i < lines.length; i++) {
    console.log(String(i + 1).padStart(2, "0") + ":", lines[i]);
  }

  // delimiter guess from header line
  const header = lines[0] ?? "";
  const comma = (header.match(/,/g) ?? []).length;
  const semi = (header.match(/;/g) ?? []).length;
  const tab = (header.match(/\t/g) ?? []).length;
  console.log("DELIM GUESS:", { comma, semi, tab });
}

for (const f of files) {
  preview(path.join(seedDir, f));
}