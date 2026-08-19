"use client";

import { useMemo, useState } from "react";

type BluetoothDeviceLike = {
  id: string;
  name?: string;
};

type BluetoothNavigator = Navigator & {
  bluetooth?: {
    requestDevice(options: { acceptAllDevices: boolean; optionalServices?: string[] }): Promise<BluetoothDeviceLike>;
  };
};

const rpmSamples = [
  14120, 13880, 13440, 13020, 12840, 13110, 13460, 13620, 13580, 13230, 12890, 12660, 12140, 11680,
  10940, 10580, 10420, 10080, 9650, 9380, 8940, 8720, 8220, 7850, 7360, 6920, 6450, 6040, 5520, 4980,
  4380, 3860, 3260, 2740, 2210, 1680, 1120, 560, 120,
];

function toPointPath(values: number[], width: number, height: number, min: number, max: number) {
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / (max - min)) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function toAreaPath(values: number[], width: number, height: number, min: number, max: number) {
  return `${toPointPath(values, width, height, min, max)} L${width} ${height} L0 ${height} Z`;
}

function RpmChart() {
  const width = 880;
  const height = 250;
  const min = 0;
  const max = 16000;
  const line = toPointPath(rpmSamples, width, height, min, max);
  const area = toAreaPath(rpmSamples, width, height, min, max);
  const peak = Math.max(...rpmSamples);
  const peakIndex = rpmSamples.indexOf(peak);
  const peakX = (peakIndex / (rpmSamples.length - 1)) * width;
  const peakY = height - ((peak - min) / (max - min)) * height;

  return (
    <div className="rounded-md border border-accent/50 bg-[#07100f]/92 p-4 shadow-[0_0_40px_rgba(0,229,143,0.08)]">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <div className="font-display text-xs font-black uppercase text-accent-2">01 RPM Test Result</div>
          <div className="mt-1 text-xs text-ink-dim">Demo RPM dataset, 2:00 simulated spin-down</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-dim">Peak RPM</div>
          <div className="font-display text-2xl font-black text-accent">{peak.toLocaleString("en-MY")}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full overflow-visible sm:h-64" role="img" aria-label="RPM line chart">
        <defs>
          <linearGradient id="rpmFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#00e58f" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#00e58f" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((tick) => {
          const y = (tick / 4) * height;
          return <line key={tick} x1="0" x2={width} y1={y} y2={y} stroke="rgba(139,152,168,0.14)" />;
        })}
        {[0, 1, 2, 3, 4, 5, 6].map((tick) => {
          const x = (tick / 6) * width;
          return <line key={tick} x1={x} x2={x} y1="0" y2={height} stroke="rgba(139,152,168,0.08)" />;
        })}
        <rect x="0" y="70" width={width} height="34" fill="rgba(0,229,143,0.06)" />
        <line x1="0" x2={width} y1="70" y2="70" stroke="rgba(0,229,143,0.55)" strokeDasharray="4 4" />
        <line x1="0" x2={width} y1="104" y2="104" stroke="rgba(0,229,143,0.55)" strokeDasharray="4 4" />
        <path d={area} fill="url(#rpmFill)" />
        <path d={line} fill="none" stroke="#5dff57" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <line x1={peakX} x2={peakX} y1={peakY} y2={height} stroke="#5dff57" strokeDasharray="2 4" />
        <circle cx={peakX} cy={peakY} r="6" fill="#07100f" stroke="#5dff57" strokeWidth="3" />
        <text x={width - 24} y="48" fill="#e8eef4" fontSize="14" textAnchor="end">
          Stable range 10,000 - 11,500 RPM
        </text>
      </svg>
    </div>
  );
}

function VibrationChart() {
  const width = 880;
  const height = 180;
  const values = useMemo(
    () =>
      Array.from({ length: 90 }, (_, index) => ({
        x: Math.sin(index * 0.65) * 0.18 + Math.sin(index * 0.19) * 0.08,
        y: Math.cos(index * 0.58) * 0.2 + Math.sin(index * 0.11) * 0.07,
        z: Math.sin(index * 0.43) * 0.16 + Math.cos(index * 0.17) * 0.11,
      })),
    []
  );
  const scale = (series: "x" | "y" | "z") =>
    values
      .map((value, index) => {
        const pointX = (index / (values.length - 1)) * width;
        const pointY = height / 2 - value[series] * 75;
        return `${index === 0 ? "M" : "L"}${pointX.toFixed(1)} ${pointY.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div className="rounded-md border border-accent/50 bg-[#07100f]/92 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-xs font-black uppercase text-accent-2">02 Vibration & Balancing Test</div>
          <div className="mt-1 text-xs text-ink-dim">Three-axis sample stream with launch trigger band</div>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="text-accent">X-axis</span>
          <span className="text-bal">Y-axis</span>
          <span className="text-atk">Z-axis</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full overflow-visible sm:h-48" role="img" aria-label="Vibration chart">
        {[0, 1, 2, 3].map((tick) => {
          const y = (tick / 3) * height;
          return <line key={tick} x1="0" x2={width} y1={y} y2={y} stroke="rgba(139,152,168,0.14)" />;
        })}
        <line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="rgba(232,238,244,0.28)" />
        <line x1="66" x2="66" y1="0" y2={height} stroke="#38d9ff" strokeDasharray="4 4" />
        <line x1={width - 18} x2={width - 18} y1="0" y2={height} stroke="#38d9ff" strokeDasharray="4 4" />
        <path d={scale("x")} fill="none" stroke="#00e58f" strokeWidth="2" />
        <path d={scale("y")} fill="none" stroke="#ffb020" strokeWidth="2" />
        <path d={scale("z")} fill="none" stroke="#ff5252" strokeWidth="2" />
      </svg>
    </div>
  );
}

function MetricCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-md border border-edge bg-panel/80 p-4">
      <div className="text-xs text-ink-dim">{label}</div>
      <div className="mt-2 font-display text-2xl font-black text-accent">
        {value}
        {unit && <span className="ml-1 text-xs text-ink-dim">{unit}</span>}
      </div>
    </div>
  );
}

export default function BalancingRpmTesterClient() {
  const [status, setStatus] = useState<"idle" | "connecting" | "paired" | "unsupported" | "cancelled">("idle");
  const [deviceName, setDeviceName] = useState<string | null>(null);

  async function connectBluetooth() {
    const bluetooth = (navigator as BluetoothNavigator).bluetooth;
    if (!bluetooth) {
      setStatus("unsupported");
      return;
    }

    setStatus("connecting");
    try {
      const device = await bluetooth.requestDevice({ acceptAllDevices: true });
      setDeviceName(device.name || device.id || "Bluetooth device");
      setStatus("paired");
    } catch {
      setStatus("cancelled");
    }
  }

  const statusCopy = {
    idle: "Ready to pair a tester device. RPM stream is under development.",
    connecting: "Opening Bluetooth pairing prompt...",
    paired: `Paired with ${deviceName}. Live RPM characteristic mapping is under development.`,
    unsupported: "Web Bluetooth is not available in this browser.",
    cancelled: "Bluetooth pairing was cancelled. Demo dataset remains loaded.",
  }[status];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_26rem]">
      <div className="space-y-4">
        <RpmChart />
        <VibrationChart />
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="X-axis RMS" value="0.18" unit="g" />
          <MetricCard label="Y-axis RMS" value="0.21" unit="g" />
          <MetricCard label="Z-axis RMS" value="0.19" unit="g" />
        </div>
        <div className="rounded-md border border-accent/40 bg-[#07100f]/92 p-4">
          <div className="font-display text-xs font-black uppercase text-accent-2">Balancing Diagnosis</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {["Weight distribution", "Axial alignment", "Vibration level", "Stability"].map((item) => (
              <div key={item} className="flex items-center justify-between gap-3 border-b border-edge/60 pb-2 text-sm">
                <span className="text-ink-dim">{item}</span>
                <span className="font-semibold text-accent">{item === "Vibration level" ? "Low" : "Excellent"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <section className="rounded-md border border-accent/50 bg-panel/90 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-display text-xs font-black uppercase text-accent-2">Bluetooth Capture</div>
              <div className="mt-1 text-xs text-ink-dim">Under development</div>
            </div>
            <span className="rounded-full border border-bal/50 bg-bal/10 px-3 py-1 text-[10px] font-bold uppercase text-bal">
              Demo
            </span>
          </div>
          <button
            type="button"
            onClick={connectBluetooth}
            disabled={status === "connecting"}
            className="clip-x w-full bg-accent px-5 py-3 font-display text-xs font-black uppercase text-bg transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {status === "connecting" ? "Connecting..." : "Connect Bluetooth"}
          </button>
          <p className="mt-3 min-h-10 text-sm leading-relaxed text-ink-dim">{statusCopy}</p>
          <div className="mt-4 rounded-md border border-edge bg-bg/60 p-3 text-xs leading-relaxed text-ink-dim">
            Web Bluetooth can pair with a device in Chrome or Edge over HTTPS. Live RPM intake needs the sensor
            service UUID and characteristic mapping before real datasets can replace this demo stream.
          </div>
        </section>

        <section className="rounded-md border border-edge bg-panel/90 p-4">
          <div className="font-display text-xs font-black uppercase text-accent-2">Test Information</div>
          <div className="mt-4 space-y-2 text-sm">
            {[
              ["Test ID", "SDX-DEV-001"],
              ["Mode", "Balancing RPM Tester"],
              ["Spin time", "2:00 min"],
              ["Dataset", "Demo stream"],
              ["Status", "Under development"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-edge/60 pb-2">
                <span className="text-ink-dim">{label}</span>
                <span className="text-right font-semibold">{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-accent/50 bg-[#07100f]/92 p-4">
          <div className="font-display text-xs font-black uppercase text-accent-2">RPM Summary</div>
          <div className="mt-4 grid gap-3">
            <MetricCard label="Peak RPM" value="14,120" unit="rpm" />
            <MetricCard label="Average RPM" value="8,554" unit="rpm" />
            <MetricCard label="Stable RPM" value="10,560" unit="rpm" />
          </div>
        </section>

        <section className="rounded-md border border-accent/50 bg-[#07100f]/92 p-4">
          <div className="font-display text-xs font-black uppercase text-accent-2">Balancing Score</div>
          <div className="mt-4 flex items-center gap-5">
            <div className="flex size-24 items-center justify-center rounded-full border-[10px] border-accent bg-accent/10 font-display text-4xl font-black text-accent">
              A
            </div>
            <div>
              <div className="font-display text-5xl font-black text-accent">92</div>
              <div className="text-xs text-ink-dim">/100 Excellent balance</div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
