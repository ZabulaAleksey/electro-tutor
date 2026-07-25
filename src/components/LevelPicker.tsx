import { Atom, BookOpenText, Zap } from "lucide-react";
import { text } from "../data";
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
  return (
    <div className="level-picker">
      <span className="level-label">{text.level[language]}</span>
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
              <span>{value}. {text.levels[value][language]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
