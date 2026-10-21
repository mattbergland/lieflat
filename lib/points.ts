import points from "@/data/points.json";

export type PointsData = typeof points;
export type Program = PointsData["programs"][number];
export type Award = PointsData["awards"][number];
export type Currency = PointsData["currencies"][number];

export const programById = new Map(
  points.programs.map((program) => [program.id, program]),
);

export const sourceProgramIds: Record<string, string> = {
  aeroplan: "aeroplan",
  flyingblue: "flyingblue",
  american: "aadvantage",
  alaska: "alaska",
  united: "united",
  virginatlantic: "virgin",
  lifemiles: "lifemiles",
  qatar: "avios_qr",
  emirates: "emirates",
  etihad: "etihad",
  singapore: "singapore",
  turkish: "turkish",
  ana: "ana",
};
