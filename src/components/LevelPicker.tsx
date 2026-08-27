import { Atom, BookOpenText, Zap } from "lucide-react";
import { getLocale } from "../i18n";
import type { DetailLevel, Language } from "../types";

const icons = { 1: Atom, 2: BookOpenText, 3: Zap };

export default function LevelPicker({
  level,
  language,
  onChange,
}: {
  level: DetailLevel;
  language: Language;
  onChange: (value: DetailLevel) => void;
}) {
  const copy = getLocale(language).levelPicker;
  const labels = { 1: copy.one, 2: copy.two, 3: copy.three } as const;
  return (
    <div className="level-picker">
      <span className="level-label">{copy.label}</span>
      <div className="level-options">
        {([1, 2, 3] as DetailLevel[]).map((value) => {
          const Icon = icons[value];
          return (
            <button
              key={value}
              className={level === value ? "selected" : ""}
              onClick={() => onChange(value)}
            >
              <Icon size={16} />
              <span>{value}. {labels[value]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
