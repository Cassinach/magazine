// 定点観測（watchlist）の前号比較
// trend: new | changed (推しが変わった) | version (同じ推しでバージョンだけ更新) | flat
export function diffWatchlist(prev, cur) {
  const prevMap = new Map((prev?.items ?? []).map((it) => [it.id, it]));
  return (cur?.items ?? []).map((it) => {
    const p = prevMap.get(it.id);
    let trend = 'flat';
    let from = null;
    if (!p) trend = 'new';
    else if (p.pick !== it.pick) { trend = 'changed'; from = p.pick; }
    else if ((p.version ?? '') !== (it.version ?? '')) { trend = 'version'; from = p.version ?? ''; }
    return { ...it, trend, from };
  });
}

export const TREND_LABEL = {
  new: { mark: '✦', label: '新規' },
  changed: { mark: '⇄', label: '推し変更' },
  version: { mark: '↑', label: '更新' },
  flat: { mark: '→', label: '据え置き' },
};
