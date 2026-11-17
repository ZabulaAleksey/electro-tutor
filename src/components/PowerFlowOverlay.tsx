import type { Drawing } from "../circuit/drawing";
import { formatEngineeringNumber } from "../engineering/format";
import type { PowerOverlayLayer, PowerOverlayReadings } from "../power-system/flow-overlay";
import type { Language } from "../types";

export function PowerFlowOverlay({ drawing, readings, layers, language }: {
  drawing: Drawing; readings: PowerOverlayReadings; layers: ReadonlySet<PowerOverlayLayer>; language: Language;
}) {
  const fmt = (value: number) => formatEngineeringNumber(value, language, { maximumFractionDigits: 3 });
  return <g className="power-flow-overlay" pointerEvents="none" aria-hidden="true">
    {readings.nodes.map(node => {
      const point = drawing.junctionPositions[node.busId];
      if (!point) return null;
      const warning = layers.has("warnings") && node.outOfRange;
      const lines = [
        layers.has("voltage") ? fmt(node.voltageKv) + " kV" : "",
        layers.has("angle") ? fmt(node.angleDeg) + "°" : "",
        warning ? "!" : "",
      ].filter(Boolean);
      return lines.length ? <text key={node.busId} className={warning ? "power-flow-warning" : undefined}
        data-overlay-bus={node.busId} data-overlay-voltage={node.voltageKv}
        x={point.x} y={point.y + 27} textAnchor="middle">{lines.join(" · ")}</text> : null;
    })}
    {readings.branches.map(branch => {
      const point = drawing.positions[branch.id];
      const from = drawing.junctionPositions[branch.fromBusId];
      const to = drawing.junctionPositions[branch.toBusId];
      if (!point || !from || !to || !branch.sendingPowerMva) return null;
      const { re: p, im: q } = branch.sendingPowerMva;
      const warning = layers.has("warnings") && branch.overloaded;
      const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
      const arrows = [
        { layer: "active", value: p, label: "P", unit: "MW", dy: -32 },
        { layer: "reactive", value: q, label: "Q", unit: "MVAr", dy: -53 },
      ] as const;
      const readingsText = [
        layers.has("current") && branch.fromCurrentKa !== null ? fmt(branch.fromCurrentKa * 1000) + " A" : "",
        layers.has("losses") ? "ΔP " + fmt(branch.seriesLossesMva.re) + " MW · ΔQ " + fmt(branch.seriesLossesMva.im) + " MVAr" : "",
        layers.has("loading") ? branch.loadingPercent === null ? "— %" : fmt(branch.loadingPercent) + "%" : "",
        warning ? "!" : "",
      ].filter(Boolean);
      return <g key={branch.id} data-overlay-branch={branch.id} data-overlay-loading={branch.loadingPercent ?? ""}
        className={warning ? "power-flow-warning" : undefined}>
        {arrows.filter(arrow => layers.has(arrow.layer) && Math.abs(arrow.value) > 1e-9).map(arrow => {
          const signedAngle = angle + (arrow.value < 0 ? 180 : 0);
          return <g key={arrow.layer} className={"power-flow-" + arrow.layer} data-overlay-arrow={arrow.layer}
            data-overlay-direction={arrow.value > 0 ? branch.fromBusId + ":" + branch.toBusId : branch.toBusId + ":" + branch.fromBusId}
            transform={"translate(" + point.x + " " + (point.y + arrow.dy) + ")"}>
            <path d="M-10 0H10 M4 -4L10 0L4 4" fill="none" stroke="currentColor" strokeWidth="1.9"
              transform={"rotate(" + signedAngle + ")"} />
            <text x="15" y="4">{arrow.label + " " + fmt(Math.abs(arrow.value)) + " " + arrow.unit}</text>
          </g>;
        })}
        {readingsText.length > 0 && <text x={point.x} y={point.y + 36} textAnchor="middle">{readingsText.join(" · ")}</text>}
      </g>;
    })}
  </g>;
}
