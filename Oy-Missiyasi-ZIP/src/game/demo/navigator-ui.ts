import { landingSiteScore, type LandingSite } from './landing-sites'

export type DemoTranslate = (key: string) => string

export function renderNavigator(
  sites: readonly LandingSite[],
  selectedId: string | null,
  recommendedId: string,
  translate: DemoTranslate,
  useUzbek: boolean,
): string {
  const reason = (site: LandingSite) => useUzbek ? site.reasonUz : site.reasonEn
  const cards = sites.map((site, index) => {
    const isSelected = site.id === selectedId
    const isRecommended = site.id === recommendedId
    const score = landingSiteScore(site)
    const metrics = [
      [translate('demo.site.safety'), site.safety],
      [translate('demo.site.science'), site.science],
      [translate('demo.site.sunlight'), site.sunlight],
      [translate('demo.site.comms'), site.comms],
      ['Hazard', 100 - site.hazardIndex], // invert so higher is better
    ] as const
    return `<button class="site-card ${isSelected ? 'is-selected' : ''} ${isRecommended ? 'is-recommended' : ''}" data-demo-site="${site.id}" aria-pressed="${isSelected}">
      <span class="site-card-top"><i>${index + 1}</i><b>${site.name}</b>${isRecommended ? `<em>${translate('demo.site.recommend')}</em>` : ''}</span>
      <small class="site-coordinates">${Math.abs(site.latitudeDeg).toFixed(1)}°${site.latitudeDeg < 0 ? 'S' : 'N'} · ${Math.abs(site.longitudeDeg).toFixed(1)}°${site.longitudeDeg < 0 ? 'W' : 'E'} · Slope ${site.slopeDegrees.toFixed(1)}°</small>
      <span class="site-reason">${reason(site)}</span>
      <span class="site-metrics">${metrics.map(([label, value]) => `<span><i>${label}</i><b><em style="width:${value}%"></em></b><small>${value}</small></span>`).join('')}</span>
      <span class="site-extra">Illum: ${site.illuminationHours}h · Earth vis: ${site.earthVisibility}% · Safe zone: ${site.safeZoneRadiusM}m</span>
      <span class="site-score"><i>${translate('demo.site.overall')}</i><b>${score}</b></span>
    </button>`
  }).join('')
  const mapMarkers = sites.map((site, index) =>
    `<button class="site-map-marker ${site.id === selectedId ? 'is-selected' : ''} ${site.id === recommendedId ? 'is-recommended' : ''}" data-demo-site="${site.id}" style="--map-x:${(site.longitudeDeg + 180) / 360 * 100}%;--map-y:${(90 - site.latitudeDeg) / 180 * 100}%" aria-label="${index + 1}: ${site.name}">${index + 1}</button>`,
  ).join('')

  return `<div class="navigator-heading"><span>${translate('demo.nav.kicker')}</span><b>Lunar Landing Navigator</b></div>
    <h1>${translate('demo.nav.title')}</h1><p class="panel-description">${translate('demo.nav.copy')}</p>
    <div class="site-map" aria-label="${translate('demo.nav.map')}"><span>90°N</span><span>0°</span><span>90°S</span>${mapMarkers}</div>
    <div class="site-card-list">${cards}</div>
    <div class="site-selection-hint">${translate('demo.nav.hint')}</div>`
}
