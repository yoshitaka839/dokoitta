// 眼鏡を確かめる場所の候補（サンプル）。実際の家の情報は入れない。
// 本番で使うときは、家族が自分の家に合わせてここを書きかえる想定。

export type TimeBand = "morning" | "noon" | "evening" | "night";

export type Place = {
  id: string;
  name: string; // 読み上げる場所の名前
  action: string; // 確かめ方（読み上げる）
  body?: boolean; // 体まわり（最初に確かめる場所）
  base: number; // いつもの置き場所としての重み
  bands?: Partial<Record<TimeBand, number>>; // 時間帯ごとの加点
};

export const PLACES: Place[] = [
  { id: "head", name: "頭の上", action: "頭の上を、手でさわってみてください", body: true, base: 100 },
  { id: "neck", name: "首元", action: "首から下げていないか、胸のあたりをさわってみてください", body: true, base: 95 },
  { id: "pocket", name: "服のポケット", action: "胸と、ズボンのポケットをさわってみてください", body: true, base: 90 },
  { id: "living_table", name: "居間のテーブル", action: "居間のテーブルの上と、新聞の下を見てください", base: 60, bands: { morning: 15, noon: 10 } },
  { id: "tv_side", name: "テレビのそば", action: "テレビの前と、リモコンのあたりを見てください", base: 50, bands: { evening: 15, night: 10 } },
  { id: "sofa", name: "ソファ", action: "ソファの上と、すき間を見てください", base: 45, bands: { noon: 10, evening: 10 } },
  { id: "washroom", name: "洗面所", action: "洗面台のまわりを見てください", base: 45, bands: { morning: 20, night: 15 } },
  { id: "bedside", name: "寝室の枕元", action: "枕元と、ふとんのまわりを見てください", base: 40, bands: { morning: 20, night: 20 } },
  { id: "kitchen", name: "台所", action: "台所のテーブルと、流しのまわりを見てください", base: 35, bands: { morning: 10, noon: 15, evening: 10 } },
  { id: "toilet", name: "トイレ", action: "トイレの棚の上を見てください", base: 30 },
  { id: "entrance", name: "玄関", action: "玄関の棚の上を見てください", base: 25, bands: { noon: 10 } },
];

export function placeById(id: string): Place | undefined {
  return PLACES.find((p) => p.id === id);
}
