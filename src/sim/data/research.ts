import type { ResearchDefinition } from '../types';
import type { ImprovementId, ManagementDomain, ManagementUpgradeId, StrategicUpgradeId } from '../types';

export interface ManagementUpgradeDefinition {
  id: ManagementUpgradeId;
  domain: ManagementDomain;
  name: string;
  branch: string;
  description: string;
  outcome: string;
  baseCost: number;
  costGrowth: number;
  baseDuration: number;
  durationGrowth: number;
  maxLevel: number;
  color: string;
  icon: string;
  fixedImprovement?: ImprovementId;
  randomPool?: readonly ImprovementId[];
}

export interface TreasuryUpgradeDefinition {
  id: StrategicUpgradeId;
  name: string;
  field: string;
  description: string;
  effect: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  color: string;
  icon: string;
}

export const TREASURY_UPGRADES: readonly TreasuryUpgradeDefinition[] = [
  {
    id: 'demographics', name: 'National Growth Programme', field: 'Population', icon: '◉', color: '#62dfaf',
    description: 'Healthcare, housing and family infrastructure gradually improve long-term population growth.',
    effect: '+0.025 points annual population growth per level', baseCost: 72, costGrowth: 1.95, maxLevel: 4,
  },
  {
    id: 'weapons', name: 'Advanced Combat Systems', field: 'Attack', icon: '↗', color: '#ff8a75',
    description: 'Precision weapons, targeting networks and modern doctrine improve every offensive force.',
    effect: '+3% ATK per level', baseCost: 68, costGrowth: 1.8, maxLevel: 5,
  },
  {
    id: 'defence-systems', name: 'Layered Defence Systems', field: 'Defence', icon: '⬡', color: '#70c9f4',
    description: 'Hardened positions, air defence and electronic protection strengthen national forces.',
    effect: '+3% DEF per level', baseCost: 66, costGrowth: 1.8, maxLevel: 5,
  },
  {
    id: 'logistics', name: 'Strategic Logistics Corps', field: 'Recovery', icon: '✚', color: '#f0bd68',
    description: 'Medical evacuation, supply automation and repair depots restore lost HP faster.',
    effect: '+6% HP recovery per level', baseCost: 58, costGrowth: 1.75, maxLevel: 5,
  },
  {
    id: 'mobilization', name: 'Industrial Mobilization', field: 'Force capacity', icon: '▦', color: '#bd91ff',
    description: 'Reserve training and military production modestly expand force capacity and training throughput.',
    effect: '+4% force capacity and +8% training per level', baseCost: 74, costGrowth: 1.85, maxLevel: 5,
  },
];

export const TREASURY_UPGRADE_BY_ID: Readonly<Partial<Record<StrategicUpgradeId, TreasuryUpgradeDefinition>>> = Object.fromEntries(
  TREASURY_UPGRADES.map((upgrade) => [upgrade.id, upgrade]),
);

export function treasuryUpgradeCost(upgrade: TreasuryUpgradeDefinition, level: number): number {
  return Math.round(upgrade.baseCost * upgrade.costGrowth ** level * 10) / 10;
}

export const RESEARCH_PROJECTS: readonly ResearchDefinition[] = [
  {
    id: 'resilient-grids',
    name: 'Resilient energy grids',
    field: 'Economic security',
    cost: 125,
    description: 'Distributed energy, storage and smart grid control shield production from disruption.',
    effect: '+1% economic resilience',
    color: '#62dfaf',
  },
  {
    id: 'integrated-logistics',
    name: 'Integrated logistics',
    field: 'Defence',
    cost: 140,
    description: 'Predictive supply and modular depots accelerate repairs and readiness.',
    effect: '+1% force recovery',
    color: '#f0bd68',
  },
  {
    id: 'federated-ai',
    name: 'Federated AI networks',
    field: 'Research',
    cost: 165,
    description: 'Research centres share models without centralising sensitive data.',
    effect: '+1% passive research speed',
    color: '#b391ff',
  },
  {
    id: 'diplomatic-analytics',
    name: 'Diplomatic analytics',
    field: 'Foreign affairs',
    cost: 120,
    description: 'Real-time scenario analysis improves mediation, trade talks and crisis prevention.',
    effect: '+1% strategic analysis output',
    color: '#69d8ed',
  },
];

export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH_PROJECTS.map((project) => [project.id, project]));

export const IMPROVEMENT_LABELS: Readonly<Record<ImprovementId, string>> = {
  attack: '+1% national ATK',
  defense: '+1% national DEF',
  recovery: '+1% HP recovery',
  training: '+1% training speed',
  'manpower-capacity': '+1% manpower capacity',
  'research-speed': '+1% research speed',
  'research-cost': '−1% research cost',
  'population-growth': '+1% demographic trend',
  revenue: '+1% public revenue',
  upkeep: '−1% military upkeep',
  industry: '+1% industrial output',
};

export const MANAGEMENT_UPGRADES: readonly ManagementUpgradeDefinition[] = [
  {
    id: 'lab-network', domain: 'research', branch: 'Research infrastructure', icon: '⌬', color: '#b391ff',
    name: 'Distributed laboratory network', description: 'Connect national laboratories and secure data centres.',
    outcome: 'Guaranteed +1% passive research speed', fixedImprovement: 'research-speed',
    baseCost: 7.2, costGrowth: 1.72, baseDuration: 104, durationGrowth: 0.14, maxLevel: 8,
  },
  {
    id: 'grant-efficiency', domain: 'research', branch: 'Research infrastructure', icon: '◇', color: '#69d8ed',
    name: 'Grant efficiency reform', description: 'Reduce duplication and negotiate better research procurement.',
    outcome: 'Guaranteed −1% research cost', fixedImprovement: 'research-cost',
    baseCost: 7.8, costGrowth: 1.75, baseDuration: 112, durationGrowth: 0.14, maxLevel: 8,
  },
  {
    id: 'military-research', domain: 'research', branch: 'Military R&D', icon: '↗', color: '#ff8a75',
    name: 'Military innovation programme', description: 'Fund experimental doctrine, weapons and training systems.',
    outcome: 'Random +1% military improvement', randomPool: ['attack', 'training'],
    baseCost: 6.4, costGrowth: 1.68, baseDuration: 92, durationGrowth: 0.12, maxLevel: 12,
  },
  {
    id: 'defence-research', domain: 'research', branch: 'Defence R&D', icon: '⬡', color: '#70c9f4',
    name: 'Defensive innovation programme', description: 'Test protection, fortification and battlefield recovery systems.',
    outcome: 'Random +1% defensive improvement', randomPool: ['defense', 'recovery'],
    baseCost: 6.2, costGrowth: 1.68, baseDuration: 92, durationGrowth: 0.12, maxLevel: 12,
  },
  {
    id: 'science-research', domain: 'research', branch: 'Science R&D', icon: '✦', color: '#a78bfa',
    name: 'Experimental science programme', description: 'Let independent teams pursue high-risk research methods.',
    outcome: 'Random +1% speed or −1% cost', randomPool: ['research-speed', 'research-cost'],
    baseCost: 6.8, costGrowth: 1.7, baseDuration: 98, durationGrowth: 0.13, maxLevel: 12,
  },
  {
    id: 'population-research', domain: 'research', branch: 'Population R&D', icon: '◉', color: '#62dfaf',
    name: 'Demographic resilience programme', description: 'Study healthcare, housing and long-term demographic stability.',
    outcome: 'Random +1% demographic or reserve improvement', randomPool: ['population-growth', 'manpower-capacity'],
    baseCost: 6.0, costGrowth: 1.66, baseDuration: 96, durationGrowth: 0.12, maxLevel: 12,
  },
  {
    id: 'tax-modernization', domain: 'finance', branch: 'Revenue', icon: '$', color: '#62dfaf',
    name: 'Tax administration modernization', description: 'Improve collection and reduce leakage without creating another budget.',
    outcome: 'Guaranteed +1% public revenue', fixedImprovement: 'revenue',
    baseCost: 5.8, costGrowth: 1.7, baseDuration: 78, durationGrowth: 0.13, maxLevel: 10,
  },
  {
    id: 'procurement-reform', domain: 'finance', branch: 'Efficiency', icon: '≋', color: '#69d8ed',
    name: 'Defence procurement reform', description: 'Consolidate contracts and remove recurring military waste.',
    outcome: 'Guaranteed −1% military upkeep', fixedImprovement: 'upkeep',
    baseCost: 5.4, costGrowth: 1.68, baseDuration: 82, durationGrowth: 0.13, maxLevel: 10,
  },
  {
    id: 'industrial-capacity', domain: 'finance', branch: 'Industry', icon: '▦', color: '#f0bd68',
    name: 'Strategic industrial capacity', description: 'Expand productive infrastructure that supports growth and reinforcement.',
    outcome: 'Guaranteed +1% industrial output', fixedImprovement: 'industry',
    baseCost: 7.0, costGrowth: 1.74, baseDuration: 104, durationGrowth: 0.14, maxLevel: 10,
  },
  {
    id: 'offensive-command', domain: 'war', branch: 'Doctrine', icon: '⚔', color: '#ff8a75',
    name: 'Joint offensive command', description: 'Standardise targeting, manoeuvre and operational planning.',
    outcome: 'Guaranteed +1% national ATK', fixedImprovement: 'attack',
    baseCost: 6.6, costGrowth: 1.72, baseDuration: 88, durationGrowth: 0.13, maxLevel: 10,
  },
  {
    id: 'defensive-command', domain: 'war', branch: 'Doctrine', icon: '⬡', color: '#70c9f4',
    name: 'Layered defensive command', description: 'Coordinate fortifications, air defence and counterattack reserves.',
    outcome: 'Guaranteed +1% national DEF', fixedImprovement: 'defense',
    baseCost: 6.5, costGrowth: 1.72, baseDuration: 88, durationGrowth: 0.13, maxLevel: 10,
  },
  {
    id: 'field-logistics', domain: 'war', branch: 'Sustainment', icon: '✚', color: '#f0bd68',
    name: 'Field logistics command', description: 'Improve repair routes, medical evacuation and battlefield supply.',
    outcome: 'Guaranteed +1% HP recovery', fixedImprovement: 'recovery',
    baseCost: 5.9, costGrowth: 1.68, baseDuration: 82, durationGrowth: 0.12, maxLevel: 10,
  },
  {
    id: 'training-command', domain: 'war', branch: 'Mobilization', icon: '◆', color: '#bd91ff',
    name: 'National training command', description: 'Expand instructor capacity and standardise reserve mobilisation.',
    outcome: 'Guaranteed +1% training speed', fixedImprovement: 'training',
    baseCost: 6.2, costGrowth: 1.7, baseDuration: 86, durationGrowth: 0.13, maxLevel: 10,
  },
];

export const MANAGEMENT_UPGRADE_BY_ID: Readonly<Partial<Record<ManagementUpgradeId, ManagementUpgradeDefinition>>> = Object.fromEntries(
  MANAGEMENT_UPGRADES.map((upgrade) => [upgrade.id, upgrade]),
);
