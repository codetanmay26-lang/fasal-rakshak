import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Battery,
  Camera,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Cpu,
  Crosshair,
  Factory,
  Gauge,
  GitBranch,
  Layers3,
  Menu,
  MapPin,
  Radio,
  RotateCcw,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sun,
  Timer,
  Wifi,
  Zap,
} from 'lucide-react';

type Sensor = 'HSI' | 'NIR' | 'UV' | 'RGB';
type TraceItem = { time: string; label: string; detail: string; tone: 'ok' | 'warn' | 'neutral' };

const sensors: { id: Sensor; name: string; wavelength: string; color: string }[] = [
  { id: 'HSI', name: 'Hyperspectral', wavelength: '400–1000 nm', color: '#c79c3a' },
  { id: 'NIR', name: 'Near infrared', wavelength: '900–1700 nm', color: '#4e9b85' },
  { id: 'UV', name: 'Ultraviolet', wavelength: '254–400 nm', color: '#6c8fc5' },
  { id: 'RGB', name: 'Surface vision', wavelength: 'Visible spectrum', color: '#ba7666' },
];

const baseline = [42, 43, 47, 51, 56, 58, 57, 55, 52, 49, 48, 47, 45, 42, 41, 40, 42, 45, 48, 52, 55, 56, 54, 50, 46, 44, 42, 41, 40, 42, 44, 47, 49, 52, 54, 55];
const anomalyCurve = [42, 43, 48, 53, 58, 61, 59, 56, 53, 49, 48, 47, 45, 42, 41, 40, 42, 48, 59, 72, 79, 76, 68, 60, 54, 48, 42, 41, 40, 42, 45, 49, 57, 65, 63, 57];
const cleanCurve = [42, 43, 47, 51, 56, 58, 57, 55, 52, 49, 48, 47, 45, 42, 41, 40, 42, 45, 48, 52, 55, 56, 54, 50, 46, 44, 42, 41, 40, 42, 44, 47, 49, 52, 54, 55];
const roverImage = `${import.meta.env.BASE_URL}rover-hsi-reference.png`;

function tickTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function Sparkline({ values, color, height = 80, fill = false }: { values: number[]; color: string; height?: number; fill?: boolean }) {
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${height - (v / 100) * (height - 10) - 5}`).join(' ');
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden="true">
      {fill && <polygon points={`0,${height} ${points} 100,${height}`} fill={color} opacity=".09" />}
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SectionKicker({ children, index }: { children: string; index: string }) {
  return (
    <div className="mb-5 flex items-center gap-3 mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">
      <span className="flex h-6 w-6 items-center justify-center border border-[hsl(var(--accent))] text-[hsl(var(--accent))]">{index}</span>
      <span>{children}</span>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: 'live' | 'good' | 'warn' | 'neutral'; children: string }) {
  const styles = {
    live: 'border-[#4e9b85]/35 bg-[#4e9b85]/10 text-[#246650]',
    good: 'border-[#4e9b85]/35 bg-[#4e9b85]/10 text-[#246650]',
    warn: 'border-[#c56c48]/45 bg-[#c56c48]/10 text-[#9f472d]',
    neutral: 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
  };
  return <span className={`inline-flex items-center gap-1.5 border px-2 py-1 mono text-[9px] uppercase tracking-[.16em] ${styles[tone]}`}><span className={tone === 'live' ? 'live-dot h-1.5 w-1.5 rounded-full bg-[#4e9b85]' : 'h-1.5 w-1.5 rounded-full bg-current'} />{children}</span>;
}

const workflowStages = [
  { stage: 1, code: '01', title: 'Rover movement / navigation', detail: '4WD chassis follows the mapped inspection route with LiDAR, GPS and obstacle sensing.' },
  { stage: 2, code: '02', title: 'Synchronized spectral capture', detail: 'HSI, NIR, UV and RGB cameras capture the same surface window in one pass.' },
  { stage: 3, code: '03', title: 'Preprocess / feature extraction', detail: 'Edge preprocessing aligns frames and isolates surface response features.' },
  { stage: 4, code: '04', title: 'Adaptive baseline comparison', detail: 'The current response is compared with a clean reference for this batch and field context.' },
  { stage: 5, code: '05', title: 'Spectral anomaly / risk signal', detail: 'A correlated surface and spectral anomaly cluster is flagged above the adaptive deviation threshold.' },
  { stage: 6, code: '06', title: 'Edge AI risk classification', detail: 'Edge AI weighs the evidence and produces a contamination-risk classification locally.' },
  { stage: 7, code: '07', title: 'Result / action', detail: 'The inspection trace records PASS or hold-for-review action for the operator.' },
];

function FieldAnimation({ stage, anomaly }: { stage: number; anomaly: boolean }) {
  const active = stage > 0;
  // 8 crop items along the conveyor / field row
  const items = useMemo(() => [
    { x: 8, label: '●' },
    { x: 20, label: '●' },
    { x: 32, label: '●' },
    { x: 44, label: '●' },
    { x: 56, label: '●' },
    { x: 68, label: '●' },
    { x: 78, label: '●' },
    { x: 90, label: '●' },
  ], []);

  // Rover position moves across as stages advance
  const roverX = active ? Math.min(8 + (stage / 7) * 84, 90) : 4;
  // Which items have been scanned
  const scannedCount = active ? Math.min(Math.floor(stage * 1.2), items.length) : 0;
  // Index of the flagged (anomaly) item
  const flaggedIdx = 5;

  return (
    <div className="relative h-[170px] w-full overflow-hidden bg-[#1a3d30]" style={{ borderRadius: '2px' }}>
      {/* Field background — soil rows */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'repeating-linear-gradient(180deg, transparent 0px, transparent 18px, rgba(78,155,133,.12) 18px, rgba(78,155,133,.12) 20px)',
      }} />

      {/* Conveyor / path line */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none">
        {/* Field path */}
        <line x1="2" y1="22" x2="98" y2="22" stroke="#3a6b5a" strokeWidth=".4" strokeDasharray="1.5 1" />
        <line x1="2" y1="18" x2="98" y2="18" stroke="#3a6b5a" strokeWidth=".15" />
        <line x1="2" y1="26" x2="98" y2="26" stroke="#3a6b5a" strokeWidth=".15" />

        {/* Crop items along the path */}
        {items.map((item, i) => {
          const scanned = i < scannedCount;
          const flagged = anomaly && i === flaggedIdx && scanned;
          const scanning = active && i === scannedCount - 1;
          return (
            <g key={i}>
              {/* Item shadow */}
              <ellipse cx={item.x} cy="23" rx="3.2" ry="1.2" fill="rgba(0,0,0,.2)" />
              {/* Crop item (turmeric root shape) */}
              <ellipse
                cx={item.x}
                cy="21.5"
                rx="2.8"
                ry="2.2"
                fill={flagged ? '#c56c48' : scanned ? '#4e9b85' : '#8b7b4a'}
                opacity={scanned ? 1 : 0.5}
                className="transition-all duration-500"
              />
              <ellipse
                cx={item.x}
                cy="21"
                rx="2"
                ry="1.5"
                fill={flagged ? '#d87b5c' : scanned ? '#6ab89e' : '#a89558'}
                opacity={scanned ? 1 : 0.55}
                className="transition-all duration-500"
              />
              {/* Status indicator */}
              {scanned && (
                <g className="reveal">
                  <circle cx={item.x + 2.5} cy="17.5" r="1.2" fill={flagged ? '#c56c48' : '#4e9b85'} />
                  {flagged
                    ? <text x={item.x + 2.5} y="18.3" textAnchor="middle" fill="#fff" fontSize="1.6" fontWeight="bold">!</text>
                    : <text x={item.x + 2.5} y="18.2" textAnchor="middle" fill="#fff" fontSize="1.4">✓</text>
                  }
                </g>
              )}
              {/* Active scan ring on current item */}
              {scanning && (
                <circle cx={item.x} cy="21.5" r="4.5" fill="none" stroke="#c79c3a" strokeWidth=".3" opacity=".7"
                  style={{ animation: 'pulse-ring 1s infinite' }} />
              )}
            </g>
          );
        })}

        {/* Rover body */}
        <g className="transition-all duration-700" style={{ transform: `translateX(${roverX}%)` }}>
          {/* Rover chassis */}
          <rect x="-3.5" y="7" width="7" height="5" rx=".6" fill="#2d5c4c" stroke="#5d8878" strokeWidth=".25" />
          {/* Wheels */}
          <rect x="-3.8" y="11.5" width="2" height="1.2" rx=".3" fill="#1a3d30" stroke="#5d8878" strokeWidth=".15" />
          <rect x="1.8" y="11.5" width="2" height="1.2" rx=".3" fill="#1a3d30" stroke="#5d8878" strokeWidth=".15" />
          {/* Camera mast */}
          <line x1="0" y1="7" x2="0" y2="4" stroke="#8b8b6a" strokeWidth=".3" />
          <rect x="-1.2" y="3" width="2.4" height="1.5" rx=".3" fill="#c79c3a" stroke="#a67f2a" strokeWidth=".15" />
          {/* Solar panel */}
          <rect x="-2.5" y="5.5" width="5" height="1.2" rx=".2" fill="#3a6b5a" stroke="#5d8878" strokeWidth=".15" />
          {/* GPS antenna */}
          <line x1="2.5" y1="7" x2="2.5" y2="5.5" stroke="#8b8b6a" strokeWidth=".2" />
          <circle cx="2.5" cy="5.2" r=".35" fill="#c79c3a" />

          {/* Scan beam — only when active */}
          {active && (
            <g opacity=".65">
              <line x1="-1.5" y1="4.5" x2="-4" y2="17" stroke="#c79c3a" strokeWidth=".15" strokeDasharray=".5 .5" />
              <line x1="1.5" y1="4.5" x2="4" y2="17" stroke="#c79c3a" strokeWidth=".15" strokeDasharray=".5 .5" />
              <ellipse cx="0" cy="17.5" rx="4" ry="1" fill="rgba(199,156,58,.15)" />
              <line x1="-4" y1="17.5" x2="4" y2="17.5" stroke="#c79c3a" strokeWidth=".2" opacity=".9"
                className="scan-overlay" />
            </g>
          )}
        </g>

        {/* Status labels at top */}
        <text x="3" y="4" fill="#a6c5b4" fontSize="2" fontFamily="var(--app-font-mono)" style={{ textTransform: 'uppercase' }}>
          {active ? `scanning · ${scannedCount}/${items.length} inspected` : 'standby · awaiting dispatch'}
        </text>
        {anomaly && (
          <text x="97" y="4" fill="#c56c48" fontSize="1.8" fontFamily="var(--app-font-mono)" textAnchor="end">
            ⚠ anomaly @ item {flaggedIdx + 1}
          </text>
        )}

        {/* Field row labels */}
        <text x="1" y="22.5" fill="#5d8878" fontSize="1.5" fontFamily="var(--app-font-mono)">R04</text>

        {/* Progress dots along the path */}
        {items.map((item, i) => (
          <circle key={`dot-${i}`} cx={item.x} cy="28" r=".5"
            fill={i < scannedCount ? (anomaly && i === flaggedIdx ? '#c56c48' : '#4e9b85') : '#3a6b5a'}
            className="transition-colors duration-300"
          />
        ))}
        <text x="50" y="31.5" fill="#5d8878" fontSize="1.3" fontFamily="var(--app-font-mono)" textAnchor="middle">
          field row inspection progress
        </text>

        {/* Direction arrow */}
        {active && (
          <g opacity=".5">
            <line x1={roverX + 6} y1="10" x2={roverX + 10} y2="10" stroke="#c79c3a" strokeWidth=".3" />
            <polygon points={`${roverX + 10},8.5 ${roverX + 12},10 ${roverX + 10},11.5`} fill="#c79c3a" />
          </g>
        )}
      </svg>

      {/* Legend at bottom */}
      <div className="absolute bottom-2 left-3 right-3 flex items-center gap-4 mono text-[7px] uppercase tracking-[.1em] text-[#5d8878]">
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4e9b85]" /> pass</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#c56c48]" /> flagged</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#8b7b4a]" /> pending</span>
        <span className="ml-auto flex items-center gap-1"><span className="inline-block h-1.5 w-3 bg-[#c79c3a]/40" /> scan beam</span>
      </div>
    </div>
  );
}

function RoverVisual({ anomaly, stage, onInspect, workflowOpen, onToggleWorkflow }: { anomaly: boolean; stage: number; onInspect: () => void; workflowOpen: boolean; onToggleWorkflow: () => void }) {
  return (
    <div className="relative overflow-hidden border border-[hsl(var(--card-border))] bg-[#173f38] text-[#e9e6d5]">
      <div className="absolute inset-0 gridline opacity-[.08]" />
      {/* Header */}
      <div className="relative flex items-center justify-between p-5 pb-3">
        <div>
           <p className="mono text-[9px] uppercase tracking-[.18em] text-[#a6c5b4]">field route 04 / rover inspection</p>
           <h3 className="display mt-1 text-3xl uppercase tracking-wide">Mobile scan pass</h3>
        </div>
         <StatusPill tone={anomaly ? 'warn' : 'live'}>{anomaly ? 'risk event' : 'rover live'}</StatusPill>
      </div>
      {/* Animated field inspection scene */}
      <div className="relative mx-5 mb-3 cursor-pointer" onClick={onToggleWorkflow}>
        <FieldAnimation stage={stage} anomaly={anomaly} />
      </div>
      {/* Sensor badges */}
      <div className="relative mx-5 mb-3 flex flex-wrap gap-1.5">
        <span className="border border-[#a6c5b4]/45 bg-[#0d2d2a]/65 px-2 py-1 mono text-[8px] uppercase tracking-[.09em]"><Camera size={10} className="mr-1 inline text-[#c79c3a]" />HSI / NIR / UV / RGB</span>
        <span className="border border-[#a6c5b4]/45 bg-[#0d2d2a]/65 px-2 py-1 mono text-[8px] uppercase tracking-[.09em]"><MapPin size={10} className="mr-1 inline text-[#c79c3a]" />LiDAR + GPS route</span>
        <span className="border border-[#a6c5b4]/45 bg-[#0d2d2a]/65 px-2 py-1 mono text-[8px] uppercase tracking-[.09em]"><Cpu size={10} className="mr-1 inline text-[#c79c3a]" />edge AI enclosure</span>
        <span className="border border-[#a6c5b4]/45 bg-[#0d2d2a]/65 px-2 py-1 mono text-[8px] uppercase tracking-[.09em]"><Sun size={10} className="mr-1 inline text-[#c79c3a]" />solar power</span>
        <span className="border border-[#a6c5b4]/45 bg-[#0d2d2a]/65 px-2 py-1 mono text-[8px] uppercase tracking-[.09em]"><Battery size={10} className="mr-1 inline text-[#c79c3a]" />battery pack</span>
      </div>
      {/* Bottom bar — chassis info + action buttons */}
      <div className="relative flex flex-wrap items-end justify-between gap-3 px-5 pb-5 pt-2">
        <div className="flex gap-5 mono text-[9px] uppercase tracking-[.12em] text-[#a6c5b4]">
           <span><b className="text-[#e9e6d5]">4WD</b> chassis</span>
           <span><b className="text-[#e9e6d5]">24 V</b> field power</span>
        </div>
         <div className="flex gap-2">
           <button type="button" onClick={onToggleWorkflow} data-testid="button-rover-workflow" aria-expanded={workflowOpen} className="border border-[#a6c5b4]/50 px-3 py-2 mono text-[9px] uppercase tracking-[.12em] text-[#e9e6d5] transition-transform hover:-translate-y-0.5">
             {workflowOpen ? 'Hide workflow' : 'View workflow'}
           </button>
           <button type="button" onClick={onInspect} data-testid="button-inspect-rover" className="group flex items-center gap-2 border border-[#c79c3a] bg-[#c79c3a] px-3 py-2 mono text-[9px] uppercase tracking-[.14em] text-[#173f38] transition-transform hover:-translate-y-0.5">
             {stage > 0 ? 'View live trace' : 'Start rover pass'} <ArrowRight size={13} />
           </button>
         </div>
      </div>
    </div>
  );
}

function InspectionWorkflow({ stage, onStage }: { stage: number; onStage: (stage: number) => void }) {
  const activeIndex = stage >= 1 ? Math.min(stage - 1, workflowStages.length - 1) : -1;
  return (
    <div className="border border-t-0 border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5" style={{ boxShadow: 'var(--shadow-instrument)' }} data-testid="inspection-workflow">
      <div className="grid gap-2 md:grid-cols-7">
        {workflowStages.map((item, index) => {
          const active = index === activeIndex;
          const complete = index < activeIndex;
          return (
            <button type="button" key={item.code} onClick={() => onStage(item.stage)} data-testid={`button-workflow-step-${index + 1}`} aria-current={active ? 'step' : undefined} className={`border p-3 text-left transition-colors ${active ? 'border-[#c79c3a] bg-[#c79c3a]/10' : complete ? 'border-[#4e9b85]/55 bg-[#4e9b85]/[.06]' : 'border-[hsl(var(--border))] hover:border-[#c79c3a]/70'}`}>
              <span className={`mono text-[9px] ${active ? 'text-[#a34f38]' : complete ? 'text-[#246650]' : 'text-[hsl(var(--muted-foreground))]'}`}>{item.code}</span>
              <span className="mt-2 block text-[11px] font-bold leading-4">{item.title}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 border-l-2 border-[#c79c3a] bg-[hsl(var(--muted))] px-4 py-3" aria-live="polite">
        <p className="mono text-[9px] uppercase tracking-[.13em] text-[#a34f38]">{activeIndex >= 0 ? workflowStages[activeIndex].title : 'Ready for rover movement'}</p>
        <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{activeIndex >= 0 ? workflowStages[activeIndex].detail : 'Click a workflow step to inspect its evidence layer, or start the deterministic rover pass.'}</p>
      </div>
    </div>
  );
}

function Heatmap({ stage }: { stage: number }) {
  // Progressive heatmap: builds intensity gradually across stages 0-7
  // Stage 0: subtle baseline grid with faint green tones
  // Stages 1-2: warm amber tones appear as sensors activate
  // Stages 3-4: response pattern becomes visible with localized warm zones
  // Stages 5+: full anomaly cluster with red-orange hotspot
  const intensity = Math.min(stage / 7, 1); // 0 to 1 over all stages
  return (
    <div className="relative aspect-[1.15] min-h-[180px] overflow-hidden border border-[hsl(var(--card-border))] bg-[#203a35]">
      <div className="absolute inset-0 grid grid-cols-12 grid-rows-8 gap-[2px] p-3 opacity-95">
        {Array.from({ length: 96 }, (_, i) => {
          const x = i % 12;
          const y = Math.floor(i / 12);
          // Distance from the anomaly hotspot center
          const dist = Math.sqrt(Math.pow(x - 8.3, 2) + Math.pow(y - 3.4, 2));
          // Secondary warm zone (for multi-color variation)
          const dist2 = Math.sqrt(Math.pow(x - 4, 2) + Math.pow(y - 5.5, 2));

          let color: string;
          if (stage === 0) {
            // Idle baseline: uniform subtle green-teal
            const base = 0.06 + Math.sin(x * 0.5 + y * 0.3) * 0.03;
            color = `rgba(78, 155, 133, ${base})`;
          } else if (stage <= 2) {
            // Sensors activating: subtle amber scan pattern emerges
            const scan = 0.06 + intensity * 0.12 * Math.max(0, 1 - dist / 8);
            const scan2 = intensity * 0.08 * Math.max(0, 1 - dist2 / 6);
            const r = Math.round(78 + intensity * 121);
            const g = Math.round(155 - intensity * 20);
            const b = Math.round(133 - intensity * 75);
            color = `rgba(${r}, ${g}, ${b}, ${scan + scan2})`;
          } else if (stage <= 4) {
            // Feature extraction / baseline comparison: clear warm zones forming
            const progress = (stage - 2) / 2; // 0 to 1 over stages 3-4
            const primary = Math.max(0, 1 - dist / (6 - progress * 1.5)) * (0.3 + progress * 0.35);
            const secondary = Math.max(0, 1 - dist2 / (7 - progress)) * (0.15 + progress * 0.15);
            const hot = primary + secondary * 0.5;
            if (hot > 0.35) {
              color = `rgba(199, 156, 58, ${0.15 + hot * 0.55})`; // amber
            } else if (hot > 0.15) {
              color = `rgba(186, 168, 90, ${0.08 + hot * 0.4})`; // warm yellow-green
            } else {
              color = `rgba(78, 155, 133, ${0.05 + hot * 0.2})`; // cool teal
            }
          } else {
            // Anomaly detected (stages 5+): full red-orange hotspot with multi-color gradient
            const progress = Math.min((stage - 4) / 3, 1); // ramps 0 to 1 over stages 5-7
            const primary = Math.max(0, 1 - dist / (4.3 + (1 - progress) * 1.5));
            const secondary = Math.max(0, 1 - dist2 / 5.5) * 0.4;
            const hot = primary + secondary * 0.4;
            if (hot > 0.6) {
              // Hotspot core: red-orange
              color = `rgba(207, 101, 72, ${0.3 + hot * 0.68 * progress})`;
            } else if (hot > 0.35) {
              // Mid zone: amber-orange
              color = `rgba(199, 156, 58, ${0.12 + hot * 0.55 * progress})`;
            } else if (hot > 0.12) {
              // Outer warm: yellow-green
              color = `rgba(186, 168, 90, ${0.06 + hot * 0.35 * progress})`;
            } else {
              // Background: teal
              color = `rgba(78, 155, 133, ${0.04 + hot * 0.18})`;
            }
          }
          return <span key={i} className="transition-colors duration-700" style={{ background: color }} />;
        })}
      </div>
      <div className="absolute left-3 top-3 flex items-center gap-2 mono text-[9px] uppercase tracking-[.14em] text-[#d9ddc8]"><Crosshair size={12} /> surface response map</div>
      <div className="absolute bottom-3 left-3 right-3 flex justify-between mono text-[8px] uppercase text-[#d9ddc8]/65"><span>low response</span><span className="text-[#f0a27a]">anomaly cluster</span></div>
    </div>
  );
}

function RiskMeter({ risk, anomaly }: { risk: number; anomaly: boolean }) {
  return (
    <div className="instrument-card p-5">
      <div className="flex items-start justify-between">
        <div><p className="mono text-[9px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">edge risk score</p><p data-testid="text-risk-score" className="display mt-2 text-5xl tracking-tight">{risk}<span className="ml-1 text-xl text-[hsl(var(--muted-foreground))]">/100</span></p></div>
        <Gauge size={22} className={anomaly ? 'text-[#c56c48]' : 'text-[#4e9b85]'} />
      </div>
      <div className="mt-4 h-2 bg-[hsl(var(--muted))]"><div className={`h-full transition-all duration-700 ${anomaly ? 'bg-[#c56c48]' : 'bg-[#4e9b85]'}`} style={{ width: `${risk}%` }} /></div>
      <div className="mt-3 flex justify-between mono text-[9px] uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]"><span>clean threshold 28</span><span className={anomaly ? 'text-[#a34f38]' : 'text-[#246650]'}>{anomaly ? 'elevated' : 'within baseline'}</span></div>
    </div>
  );
}

function SpectralChart({ sensor, anomaly, onSensor }: { sensor: Sensor; anomaly: boolean; onSensor: (sensor: Sensor) => void }) {
  const active = sensors.find((item) => item.id === sensor) ?? sensors[0];
  const current = anomaly ? anomalyCurve : cleanCurve;
  return (
    <div className="instrument-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mono text-[9px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">spectral health fingerprint</p><h3 className="display mt-1 text-2xl uppercase">Adaptive clean baseline</h3></div>
        <div className="flex items-center gap-2 mono text-[9px] uppercase text-[hsl(var(--muted-foreground))]"><span className="h-2 w-2 rounded-full bg-[#4e9b85]" /> baseline <span className="ml-2 h-2 w-2 rounded-full bg-[#c56c48]" /> current</div>
      </div>
      <div className="mt-5 flex gap-1 border-b border-[hsl(var(--border))]">
        {sensors.map((item) => <button type="button" key={item.id} onClick={() => onSensor(item.id)} data-testid={`button-sensor-${item.id.toLowerCase()}`} className={`border-b-2 px-3 py-2 mono text-[9px] uppercase tracking-[.12em] transition-colors ${sensor === item.id ? 'border-[#c79c3a] text-[hsl(var(--foreground))]' : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}>{item.id}</button>)}
      </div>
      <div className="mt-5 flex items-center justify-between mono text-[9px] uppercase text-[hsl(var(--muted-foreground))]"><span style={{ color: active.color }}>{active.name}</span><span>{active.wavelength}</span></div>
      <div className="relative mt-2 h-40 border-l border-b border-[hsl(var(--border))] px-2 pb-2 pt-3">
        {[25, 50, 75].map((v) => <div key={v} className="absolute left-0 right-0 border-t border-dashed border-[hsl(var(--border))] opacity-70" style={{ top: `${100 - v}%` }} />)}
        <Sparkline values={baseline} color="#4e9b85" height={100} />
        <div className="absolute inset-2"><Sparkline values={current} color={anomaly ? '#c56c48' : '#c79c3a'} height={100} /></div>
        <span className="absolute -bottom-5 left-0 mono text-[8px] text-[hsl(var(--muted-foreground))]">400 nm</span><span className="absolute -bottom-5 right-0 mono text-[8px] text-[hsl(var(--muted-foreground))]">1000 nm</span>
      </div>
      <div className="mt-9 flex items-center justify-between border-t border-[hsl(var(--border))] pt-3 mono text-[9px] uppercase tracking-[.1em]"><span className="text-[hsl(var(--muted-foreground))]">deviation index</span><b className={anomaly ? 'text-[#a34f38]' : 'text-[#246650]'}>{anomaly ? '0.74 / elevated' : '0.08 / stable'}</b></div>
    </div>
  );
}

function Trace({ items }: { items: TraceItem[] }) {
  return (
    <div className="instrument-card p-5">
      <div className="flex items-center justify-between"><div><p className="mono text-[9px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">event stream</p><h3 className="display mt-1 text-2xl uppercase">Inspection trace</h3></div><Activity size={19} className="text-[#4e9b85]" /></div>
      <div className="mt-5 space-y-3">
        {items.slice(0, 5).map((item, i) => <div key={`${item.time}-${i}`} className="flex gap-3 border-l-2 border-[hsl(var(--border))] pl-3 reveal" style={{ animationDelay: `${i * 70}ms` }}><div className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: item.tone === 'warn' ? '#c56c48' : item.tone === 'ok' ? '#4e9b85' : '#c79c3a' }} /><div className="min-w-0"><div className="flex flex-wrap gap-x-3 gap-y-1 mono text-[9px] uppercase"><span className="text-[hsl(var(--muted-foreground))]">{item.time}</span><b>{item.label}</b></div><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.detail}</p></div></div>)}
      </div>
    </div>
  );
}

function App() {
  const [sensor, setSensor] = useState<Sensor>('HSI');
  const [stage, setStage] = useState(0);
  const [running, setRunning] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [trace, setTrace] = useState<TraceItem[]>([
    { time: tickTime(), label: 'ROVER_READY', detail: 'Route 04 loaded · clean baseline available at edge', tone: 'ok' },
    { time: '09:42:11', label: 'ROUTE_QUEUED', detail: 'FR-240118-084 · turmeric root · field row 12', tone: 'neutral' },
    { time: '09:42:10', label: 'BASELINE_CHECK', detail: 'Adaptive reference within tolerance for this batch', tone: 'ok' },
  ]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const anomaly = stage >= 5;
  const progress = Math.min(100, stage * 14.3);
  const risk = anomaly ? Math.min(91, 44 + (stage - 5) * 17) : stage >= 2 ? 21 + stage * 2 : 12;
  const phaseLabel = ['Standby / rover route queued', 'Rover moving / navigation active', 'HSI / NIR / UV / RGB synchronized', 'Preprocessing / surface features', 'Adaptive baseline comparison', 'Spectral anomaly detected', 'Edge AI risk classification: HIGH RISK', 'Result recorded / hold for review'][Math.min(stage, 7)];

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const addTrace = (label: string, detail: string, tone: TraceItem['tone']) => setTrace((previous) => [{ time: tickTime(), label, detail, tone }, ...previous].slice(0, 7));
  const simulate = () => {
    if (running) return;
    setRunning(true);
    setStage(1);
    addTrace('ROVER_DISPATCHED', 'Route 04 started · 4WD navigation and obstacle sensing active', 'neutral');
    let current = 1;
    timer.current = setInterval(() => {
      current += 1;
      setStage(current);
       if (current === 2) addTrace('SENSORS_ACTIVE', 'Raised HSI mast · NIR · UV · RGB capture synchronized', 'ok');
       if (current === 3) addTrace('FEATURE_EXTRACTED', 'Surface response map assembled from 1,024 edge samples', 'neutral');
       if (current === 4) addTrace('BASELINE_COMPARE', 'Adaptive clean baseline loaded for this batch', 'ok');
      if (current === 5) addTrace('SPECTRAL_ANOMALY', 'Anomaly cluster above adaptive deviation threshold', 'warn');
       if (current === 6) addTrace('RISK_CLASSIFIED', 'HIGH RISK · contamination risk requires hold for review', 'warn');
      if (current === 7) {
         addTrace('ACTION_RECORDED', 'Inspection trace retained · operator review requested', 'warn');
        setRunning(false);
        if (timer.current) clearInterval(timer.current);
      }
    }, 950);
  };
  const reset = () => {
    if (timer.current) clearInterval(timer.current);
    setRunning(false);
    setStage(0);
    setWorkflowOpen(false);
    addTrace('SYSTEM_RESET', 'Ready for next rover route · baseline retained', 'ok');
  };

  const nav = [
    ['overview', 'Overview'],
    ['live-inspection', 'Live inspection'],
    ['analysis', 'Analysis'],
    ['deployment', 'Deployment'],
  ];

  return (
    <div className="min-h-[100dvh] bg-[#ecebdc] text-[hsl(var(--foreground))]">
      <header className="sticky top-0 z-40 border-b border-[#cad1bf] bg-[#ecebdc]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-4 py-3 sm:px-6">
          <a href="#overview" data-testid="link-brand" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border-2 border-[#245e4c] text-[#245e4c]"><Layers3 size={20} /></div>
            <div><div className="display text-xl font-semibold uppercase leading-none tracking-wide">Fasal Rakshak</div><div className="mono mt-1 text-[8px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">food safety / inline intelligence</div></div>
          </a>
          <nav className="hidden items-center gap-6 md:flex">{nav.map(([id, label]) => <a key={id} href={`#${id}`} data-testid={`link-nav-${id}`} className="mono text-[10px] uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[#245e4c]">{label}</a>)}</nav>
          <div className="hidden items-center gap-4 sm:flex"><span className="flex items-center gap-2 mono text-[9px] uppercase text-[#246650]"><span className="live-dot h-2 w-2 rounded-full bg-[#4e9b85]" /> system online</span><span className="mono text-[9px] text-[hsl(var(--muted-foreground))]">v0.9.26</span></div>
          <button type="button" onClick={() => setMenuOpen(!menuOpen)} data-testid="button-mobile-menu" className="p-2 md:hidden"><Menu size={20} /></button>
        </div>
        {menuOpen && <nav className="border-t border-[#cad1bf] px-4 py-3 md:hidden">{nav.map(([id, label]) => <a onClick={() => setMenuOpen(false)} key={id} href={`#${id}`} data-testid={`link-mobile-nav-${id}`} className="block border-b border-[#cad1bf] py-3 mono text-[10px] uppercase tracking-[.13em]">{label}</a>)}</nav>}
      </header>

      <main>
        <section id="overview" className="section-pad relative overflow-hidden">
          <div className="pointer-events-none absolute right-[-8%] top-[-10%] h-[500px] w-[500px] rounded-full border border-[#b5c5ad] opacity-50" /><div className="pointer-events-none absolute right-[4%] top-[7%] h-[310px] w-[310px] rounded-full border border-dashed border-[#b5c5ad] opacity-70" />
          <div className="mx-auto max-w-[1180px]">
            <div className="grid items-end gap-12 lg:grid-cols-[1fr_440px]">
              <div className="reveal">
                <SectionKicker index="01">Inline inspection console / SIH 2026</SectionKicker>
                <h1 className="display max-w-[700px] text-[clamp(3.8rem,9vw,8.8rem)] font-semibold uppercase leading-[.84] tracking-[-.02em] text-[#245e4c]">The line<br /><span className="text-[#b98c2f]">sees first.</span></h1>
                 <p className="mt-8 max-w-[580px] text-base leading-7 text-[hsl(var(--muted-foreground))] sm:text-lg">Fasal Rakshak sends a mobile four-wheel hyperspectral rover through the field, compares each surface against an adaptive clean baseline, and flags contamination risk before harvest reaches the next process.</p>
                <div className="mt-8 flex flex-wrap items-center gap-4"><a href="#live-inspection" data-testid="link-hero-live" className="inline-flex items-center gap-3 bg-[#245e4c] px-5 py-3 mono text-[10px] uppercase tracking-[.15em] text-[#f2eedf] transition-transform hover:-translate-y-0.5">Open live console <ArrowRight size={15} /></a><a href="#deployment" data-testid="link-hero-architecture" className="inline-flex items-center gap-2 border-b border-[#245e4c] pb-1 mono text-[10px] uppercase tracking-[.15em] text-[#245e4c]">How it works <ChevronDown size={14} /></a></div>
              </div>
              <div className="reveal relative" style={{ animationDelay: '.16s' }}>
                <div className="gridline border border-[#bfcbbb] p-5">
                   <div className="flex items-center justify-between mono text-[9px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]"><span>FR / rover 04</span><span>09:42:18 IST</span></div>
                   <div className="mt-6 flex items-center gap-4"><div className="h-28 w-28 shrink-0 overflow-hidden border border-[#c79c3a] bg-[#f0eee3]"><img src="/rover-hsi-reference.png" alt="Fasal Rakshak hyperspectral rover" className="h-full w-full object-contain" /></div><div><div className="mono text-[10px] uppercase tracking-[.14em] text-[#245e4c]">edge inspection rover</div><div className="display mt-1 text-4xl uppercase">See in<br />motion</div></div></div>
                   <div className="mt-6 grid grid-cols-3 border-t border-[#bfcbbb] pt-4 mono text-[9px] uppercase"><div><span className="block text-[hsl(var(--muted-foreground))]">sensors</span><b>HSI + 03</b></div><div><span className="block text-[hsl(var(--muted-foreground))]">route mode</span><b>4WD / GPS</b></div><div><span className="block text-[hsl(var(--muted-foreground))]">edge action</span><b>HOLD</b></div></div>
                </div>
              </div>
            </div>
             <div className="mt-24 grid border-y border-[#c4cbbb] sm:grid-cols-3"><div className="border-b border-[#c4cbbb] py-5 sm:border-b-0 sm:border-r"><span className="mono text-[9px] uppercase text-[hsl(var(--muted-foreground))]">platform</span><div className="display mt-1 text-2xl uppercase">4WD rover</div></div><div className="border-b border-[#c4cbbb] py-5 sm:border-b-0 sm:border-r sm:pl-6"><span className="mono text-[9px] uppercase text-[hsl(var(--muted-foreground))]">edge decision</span><div className="display mt-1 text-2xl uppercase">Under 180 ms</div></div><div className="py-5 sm:pl-6"><span className="mono text-[9px] uppercase text-[hsl(var(--muted-foreground))]">system posture</span><div className="display mt-1 text-2xl uppercase">Traceable by design</div></div></div>
          </div>
        </section>

        <section id="live-inspection" className="section-pad bg-[#e1e3d2]">
          <div className="mx-auto max-w-[1180px]">
             <SectionKicker index="02">Live inspection / rover 04</SectionKicker>
             <div className="mb-9 flex flex-wrap items-end justify-between gap-6"><div><h2 className="display text-5xl uppercase leading-none text-[#245e4c] sm:text-6xl">Operate the rover.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">A deterministic simulation of one mobile inspection pass from navigation to action. Trigger the event, then watch the evidence accumulate in the Inspection Trace.</p></div><div className="flex gap-2"><button type="button" onClick={reset} data-testid="button-reset-simulation" className="inline-flex items-center gap-2 border border-[#aebdac] px-3 py-2 mono text-[9px] uppercase tracking-[.12em] hover:bg-[#d5dac7]"><RotateCcw size={13} /> Reset</button><button type="button" onClick={simulate} disabled={running} data-testid="button-simulate-anomaly" className="inline-flex items-center gap-2 bg-[#b85d42] px-4 py-2 mono text-[9px] uppercase tracking-[.12em] text-[#fbf1df] disabled:cursor-not-allowed disabled:opacity-55"><Zap size={13} /> {running ? 'Sequence running' : 'Simulate anomaly'}</button></div></div>
            <div className="mb-5 flex items-center gap-4"><div className="h-1 flex-1 bg-[#c9cfc0]"><div className="h-full bg-[#c79c3a] transition-all duration-700" style={{ width: `${progress}%` }} /></div><span data-testid="status-scan-phase" className="min-w-[205px] text-right mono text-[9px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{phaseLabel}</span></div>
             <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]"><RoverVisual anomaly={anomaly} stage={stage} onInspect={simulate} workflowOpen={workflowOpen} onToggleWorkflow={() => setWorkflowOpen((open) => !open)} /><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1"><div className="instrument-card p-5"><div className="flex items-center justify-between"><p className="mono text-[9px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">scan state</p><ScanLine size={19} className="text-[#c79c3a]" /></div><div data-testid="status-scan-state" className="mt-3 display text-3xl uppercase">{running ? 'Capturing' : anomaly ? 'Review hold' : 'Ready'}</div><div className="mt-4 grid grid-cols-2 gap-2">{sensors.map((item) => <button key={item.id} type="button" onClick={() => setSensor(item.id)} data-testid={`button-live-${item.id.toLowerCase()}`} className={`border p-2 text-left transition-colors ${sensor === item.id ? 'border-[#c79c3a] bg-[#c79c3a]/10' : 'border-[hsl(var(--border))]'}`}><span className="block mono text-[9px] font-medium" style={{ color: item.color }}>{item.id}</span><span className="mt-1 block text-[10px] text-[hsl(var(--muted-foreground))]">{item.name}</span></button>)}</div></div><RiskMeter risk={risk} anomaly={anomaly} /></div></div>
             <div className="mt-5">
               <button type="button" onClick={() => setWorkflowOpen((o) => !o)} data-testid="button-toggle-workflow" className="flex w-full items-center justify-between border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] px-5 py-3 text-left transition-colors hover:border-[#c79c3a]">
                 <div>
                   <p className="mono text-[9px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">traceable workflow / stage state</p>
                   <h3 className="display mt-1 text-lg uppercase">Inspection trace map</h3>
                 </div>
                 <div className="flex items-center gap-3">
                   <span className="mono text-[9px] uppercase tracking-[.13em] text-[#246650]">{stage >= 1 ? `stage ${Math.min(stage, 7)} / ${workflowStages.length}` : 'standby'}</span>
                   <ChevronDown size={16} className={`text-[hsl(var(--muted-foreground))] transition-transform duration-200 ${workflowOpen ? 'rotate-180' : ''}`} />
                 </div>
               </button>
               {workflowOpen && <InspectionWorkflow stage={stage} onStage={setStage} />}
             </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><Heatmap stage={stage} /><div className="instrument-card p-5"><div className="flex items-start justify-between"><div><p className="mono text-[9px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">automated disposition</p><h3 className="display mt-1 text-3xl uppercase">{anomaly ? 'Hold / field review' : 'Pass / next process'}</h3></div>{anomaly ? <CircleAlert className="text-[#c56c48]" /> : <CircleCheck className="text-[#4e9b85]" />}</div><p className="mt-4 max-w-lg text-sm leading-6 text-[hsl(var(--muted-foreground))]">{anomaly ? 'A surface anomaly and spectral deviation crossed the configured risk threshold. The item is held for review; this prototype does not claim laboratory-certified pathogen identification.' : 'No contamination risk signal above the adaptive clean baseline. Item continues to the next process stage.'}</p><div className="mt-5 flex flex-wrap gap-2 mono text-[9px] uppercase tracking-[.11em]"><span className="border border-[hsl(var(--border))] px-2 py-1">confidence {anomaly ? '0.91' : '0.96'}</span><span className="border border-[hsl(var(--border))] px-2 py-1">latency 164 ms</span><span className={`border px-2 py-1 ${anomaly ? 'border-[#c56c48]/50 text-[#a34f38]' : 'border-[#4e9b85]/50 text-[#246650]'}`}>{anomaly ? 'high risk' : 'within control'}</span></div></div></div>
          </div>
        </section>

        <section id="analysis" className="section-pad">
          <div className="mx-auto max-w-[1180px]"><SectionKicker index="03">Analysis / evidence layer</SectionKicker><div className="grid gap-12 lg:grid-cols-[.72fr_1.28fr]"><div><h2 className="display text-5xl uppercase leading-[.92] text-[#245e4c] sm:text-6xl">A fingerprint,<br />not a guess.</h2><p className="mt-6 text-sm leading-7 text-[hsl(var(--muted-foreground))]">Every product earns its own comparison. The clean baseline adapts to batch, variety, lighting, and line conditions. Risk classification is grounded in correlated signals, not a single camera frame.</p><div className="mt-8 space-y-3">{[['01', 'Spectral anomaly', 'Wavelength response deviates from clean reference'], ['02', 'Surface anomaly', 'Edge map isolates a localized response cluster'], ['03', 'Risk classification', 'Model routes the item according to configured threshold']].map(([n, title, copy]) => <div key={n} className="flex gap-4 border-t border-[#c4cbbb] pt-4"><span className="mono text-[10px] text-[#b98c2f]">{n}</span><div><h3 className="text-sm font-bold">{title}</h3><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{copy}</p></div></div>)}</div></div><SpectralChart sensor={sensor} anomaly={anomaly} onSensor={setSensor} /></div><div className="mt-10 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><Trace items={trace} /><div className="instrument-card grid grid-cols-2 gap-px bg-[hsl(var(--border))]"><div className="bg-[hsl(var(--card))] p-5"><BarChart3 size={18} className="text-[#c79c3a]" /><p className="mt-6 mono text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">today / line 04</p><p data-testid="text-inspected-count" className="display mt-1 text-4xl">1,284</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">items inspected</p></div><div className="bg-[hsl(var(--card))] p-5"><ShieldCheck size={18} className="text-[#4e9b85]" /><p className="mt-6 mono text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">within control</p><p className="display mt-1 text-4xl">98.7<span className="text-xl">%</span></p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">pass classification</p></div><div className="bg-[hsl(var(--card))] p-5"><CircleAlert size={18} className="text-[#c56c48]" /><p className="mt-6 mono text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">held for review</p><p className="display mt-1 text-4xl">17</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">risk signals</p></div><div className="bg-[hsl(var(--card))] p-5"><Timer size={18} className="text-[#245e4c]" /><p className="mt-6 mono text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">median decision</p><p className="display mt-1 text-4xl">164<span className="text-xl">ms</span></p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">edge-to-sorter</p></div></div></div></div>
        </section>

        <section id="deployment" className="section-pad bg-[#173f38] text-[#ede9d8]">
          <div className="mx-auto max-w-[1180px]"><SectionKicker index="04">Deployment / technical architecture</SectionKicker><div className="grid gap-12 lg:grid-cols-[.85fr_1.15fr]"><div><h2 className="display text-5xl uppercase leading-[.9] sm:text-6xl">Built for the<br /><span className="text-[#c79c3a]">ground you have.</span></h2><p className="mt-6 max-w-md text-sm leading-7 text-[#b4c9ba]">The primary platform is a four-wheel field rover: a raised HSI mast, RGB cameras, NIR/UV sensing, LiDAR/GPS navigation, solar and battery power, and Edge AI in one mobile inspection loop. An optional conveyor integration can carry the same trace into industrial deployment.</p><div className="mt-8 flex flex-wrap gap-2 mono text-[9px] uppercase tracking-[.12em]"><span className="border border-[#a6c5b4]/40 px-2 py-1">4WD / IP65</span><span className="border border-[#a6c5b4]/40 px-2 py-1">edge inference</span><span className="border border-[#a6c5b4]/40 px-2 py-1">optional PLC / OPC-UA</span></div></div><div className="relative border border-[#5d8878] bg-[#12352f] p-6 sm:p-9"><div className="grid gap-6 sm:grid-cols-3"><div className="border border-[#5d8878] p-4"><Radio size={19} className="text-[#c79c3a]" /><p className="mt-8 display text-2xl uppercase">Sense</p><p className="mt-2 text-xs leading-5 text-[#a6c5b4]">Raised HSI mast, RGB, NIR and UV capture synchronized frames.</p></div><div className="relative border border-[#5d8878] p-4"><Cpu size={19} className="text-[#c79c3a]" /><p className="mt-8 display text-2xl uppercase">Decide</p><p className="mt-2 text-xs leading-5 text-[#a6c5b4]">Preprocessing, baseline comparison and Edge AI risk scoring.</p><svg className="flow-line absolute -left-6 top-1/2 hidden w-6 sm:block" viewBox="0 0 24 4"><path d="M0 2h24" stroke="#c79c3a" strokeWidth="1" /></svg></div><div className="relative border border-[#5d8878] p-4"><GitBranch size={19} className="text-[#c79c3a]" /><p className="mt-8 display text-2xl uppercase">Act</p><p className="mt-2 text-xs leading-5 text-[#a6c5b4]">Inspection trace records PASS or hold-for-review; conveyor handoff is optional.</p><svg className="flow-line absolute -left-6 top-1/2 hidden w-6 sm:block" viewBox="0 0 24 4"><path d="M0 2h24" stroke="#c79c3a" strokeWidth="1" /></svg></div></div><div className="mt-7 border-t border-[#5d8878] pt-4 mono text-[9px] uppercase tracking-[.1em] text-[#a6c5b4]"><span className="text-[#c79c3a]">●</span> closed-loop response · event trace retained at field edge</div></div></div><div className="mt-16 grid gap-6 border-t border-[#5d8878] pt-7 md:grid-cols-3"><div className="flex gap-3"><Factory size={20} className="shrink-0 text-[#c79c3a]" /><div><b className="display text-xl uppercase">Field ready</b><p className="mt-1 text-xs leading-5 text-[#a6c5b4]">Solar-assisted 4WD mobility keeps sensing close to the crop surface.</p></div></div><div className="flex gap-3"><Wifi size={20} className="shrink-0 text-[#c79c3a]" /><div><b className="display text-xl uppercase">Connected trace</b><p className="mt-1 text-xs leading-5 text-[#a6c5b4]">Every risk classification leaves a readable Inspection Trace for operators.</p></div></div><div className="flex gap-3"><Settings2 size={20} className="shrink-0 text-[#c79c3a]" /><div><b className="display text-xl uppercase">Deployment options</b><p className="mt-1 text-xs leading-5 text-[#a6c5b4]">Rover-first operation with optional conveyor and PLC integration.</p></div></div></div></div>
        </section>
      </main>

      <footer className="bg-[#102e2a] px-4 py-10 text-[#a6c5b4] sm:px-6"><div className="mx-auto flex max-w-[1180px] flex-col justify-between gap-7 md:flex-row"><div><div className="display text-2xl uppercase tracking-wide text-[#ede9d8]">Fasal Rakshak</div><p className="mt-2 max-w-sm text-xs leading-5">Adaptive Hyperspectral Food Safety &amp; Contamination Detection System</p></div><div className="grid grid-cols-2 gap-x-12 gap-y-2 mono text-[9px] uppercase tracking-[.1em]"><span>Smart India Hackathon 2026</span><span>Problem Statement 26233</span><span>Team Tech Saarthi</span><span>Agriculture • FoodTech • Rural Development</span></div></div><div className="mx-auto mt-8 max-w-[1180px] border-t border-[#376454] pt-4 mono text-[8px] uppercase tracking-[.1em] text-[#719789]">Prototype interface · spectral anomaly is a screening signal, not laboratory-certified pathogen identification or guaranteed detection.</div></footer>
    </div>
  );
}

export default App;