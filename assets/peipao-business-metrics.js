(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PeipaoBusinessMetrics = api;
})(typeof globalThis === 'object' ? globalThis : this, function factory() {
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const round = (value, digits = 1) => {
    const factor = 10 ** digits;
    return Math.round(number(value) * factor) / factor;
  };

  function summarizeOrders(records) {
    const rows = Array.isArray(records) ? records : [];
    const designCount = rows.filter(row => row.type === '设计').length;
    const constructionRows = rows.filter(row => row.type === '施工');
    const constructionCount = constructionRows.length;
    const constructionAmount = constructionRows.reduce((sum, row) => sum + number(row.amount), 0);
    return {
      designCount,
      constructionCount,
      constructionAmount,
      samePeriodOrderRatio: designCount ? round(constructionCount / designCount * 100, 1) : 0,
    };
  }

  function getTimeProgress(year, asOf) {
    const current = asOf instanceof Date ? asOf : new Date(asOf);
    if (Number.isNaN(current.getTime())) throw new Error(`invalid trusted as-of timestamp: ${asOf}`);
    const start = new Date(`${year}-01-01T00:00:00+08:00`);
    const end = new Date(`${year + 1}-01-01T00:00:00+08:00`);
    const boundedMs = Math.min(Math.max(current.getTime(), start.getTime()), end.getTime());
    return round((boundedMs - start.getTime()) / (end.getTime() - start.getTime()) * 100, 1);
  }

  function resolveTargetScope(filters = {}, settings = {}) {
    const owner = filters.owner || 'all';
    const invalid = (filters.district && filters.district !== 'all')
      || (filters.type && filters.type !== 'all')
      || String(filters.search || '').trim();
    if (invalid) return null;
    const target = owner === 'all' ? settings.teamKpi : settings.memberKpi?.[owner];
    if (!target) return null;
    if (filters.month && filters.month !== 'all') {
      return {
        kind: owner === 'all' ? 'team' : 'owner',
        owner: owner === 'all' ? null : owner,
        periodMode: 'monthly_reference',
        label: '年度均分参考',
        constructionAmount: number(target.constructionAmount) / 12,
        designCount: number(target.designCount) / 12,
      };
    }
    return {
      kind: owner === 'all' ? 'team' : 'owner',
      owner: owner === 'all' ? null : owner,
      periodMode: 'annual',
      label: owner === 'all' ? '团队年度 KPI' : `${owner}年度 KPI`,
      constructionAmount: number(target.constructionAmount),
      designCount: number(target.designCount),
    };
  }

  function buildForecast(summary, target, year, asOf) {
    const timeProgress = getTimeProgress(year, asOf);
    const ratio = Math.max(timeProgress / 100, 0.01);
    return {
      timeProgress,
      constructionRate: target?.constructionAmount ? round(summary.constructionAmount / target.constructionAmount * 100, 1) : null,
      designRate: target?.designCount ? round(summary.designCount / target.designCount * 100, 1) : null,
      constructionForecast: round(summary.constructionAmount / ratio, 0),
      designForecast: round(summary.designCount / ratio, 0),
      constructionGap: target?.constructionAmount ? Math.max(0, target.constructionAmount - summary.constructionAmount) : null,
    };
  }

  function paceStatus(constructionRate, designRate, timeProgress) {
    const gap = Math.min(number(constructionRate), number(designRate)) - number(timeProgress);
    if (gap >= 6) return { code: 'ahead', label: '领先进度', gap: round(gap, 1) };
    if (gap >= -4) return { code: 'near', label: '接近进度', gap: round(gap, 1) };
    return { code: 'behind', label: '需要跟进', gap: round(gap, 1) };
  }

  function buildUnitUniverse(allYearRecords, requiredZeroUnits, district, unitOf) {
    return [...new Set([
      ...(allYearRecords || []).filter(row => row.district === district).map(unitOf).filter(Boolean),
      ...((requiredZeroUnits || {})[district] || []),
    ])].sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'));
  }

  return { summarizeOrders, getTimeProgress, resolveTargetScope, buildForecast, paceStatus, buildUnitUniverse };
});
