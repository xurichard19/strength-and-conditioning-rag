import { BALANCE_LABELS, BALANCE_STEP, balanceFromValue, balanceValue } from '@/lib/onboarding';
import { useApp } from '@/state/app-context';
import type { BalanceSliderProps } from './balance-slider';

export function BalanceSlider({ balance, onChange }: BalanceSliderProps) {
  const { colors } = useApp();
  return (
    <>
      <style>{`
        .arcel-balance { appearance: none; -webkit-appearance: none; }
        .arcel-balance::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: linear-gradient(90deg, ${colors.strength}, ${colors.endurance}); }
        .arcel-balance::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 32px; height: 32px; margin-top: -13px; border-radius: 50%; background: ${colors.card}; border: 2px solid ${colors.tint}; }
        .arcel-balance::-moz-range-track { height: 6px; border-radius: 3px; background: linear-gradient(90deg, ${colors.strength}, ${colors.endurance}); }
        .arcel-balance::-moz-range-thumb { width: 28px; height: 28px; border-radius: 50%; background: ${colors.card}; border: 2px solid ${colors.tint}; }
        .arcel-balance:focus-visible { outline: 2px solid ${colors.tint}; outline-offset: 4px; border-radius: 8px; }
      `}</style>
      <input className="arcel-balance" type="range" min={0} max={100} step={BALANCE_STEP} value={balanceValue(balance)}
        aria-label="Training balance" aria-valuetext={BALANCE_LABELS[balance]}
        onChange={event => onChange(balanceFromValue(Number(event.target.value)))}
        style={{ width: '100%', height: 48, margin: 0, background: 'transparent', cursor: 'pointer' }} />
    </>
  );
}
