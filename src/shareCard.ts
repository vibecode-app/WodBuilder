import { SetLog } from './store';
import { formatClock } from './engine';

// Renders the workout result as a shareable image card (1080x1350 PNG).
// Facebook turns text+link shares into bare link cards and drops the stats,
// so the result travels as a picture with the numbers baked in.
export async function renderShareCard(
  workoutName: string,
  sets: SetLog[],
  totalSec: number
): Promise<any | null> {
  try {
    const g: any = globalThis as any;
    const doc = g.document;
    if (!doc) return null;
    const canvas = doc.createElement('canvas');
    const W = 1080;
    const H = 1350;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const cx = W / 2;
    const fit = (text: string, maxW: number, font: string): string => {
      ctx.font = font;
      if (ctx.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 4 && ctx.measureText(t + '…').width > maxW) {
        t = t.slice(0, -1);
      }
      return t + '…';
    };

    // Background + top accent bar.
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e10600';
    ctx.fillRect(0, 0, W, 16);

    ctx.textAlign = 'center';
    let y = 130;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 62px system-ui, -apple-system, sans-serif';
    ctx.fillText('🏋️ Workout complete', cx, y);
    y += 78;

    const nameFont = 'bold 46px system-ui, -apple-system, sans-serif';
    ctx.font = nameFont;
    ctx.fillStyle = '#e10600';
    ctx.fillText(fit(`"${workoutName}"`, W - 120, nameFont), cx, y);
    y += 66;

    ctx.fillStyle = '#999999';
    ctx.font = '36px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${sets.length} sets · ${formatClock(totalSec)}`, cx, y);
    y += 44;

    // Divider.
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(80, y, W - 160, 2);
    y += 58;

    // Per-set rows (cap so the card never overflows).
    const MAX_ROWS = 16;
    const rowFont = '30px system-ui, -apple-system, sans-serif';
    const shown = sets.slice(0, MAX_ROWS);
    ctx.textAlign = 'left';
    shown.forEach((s, i) => {
      const line =
        `R${s.round} · ${s.name}` +
        (s.reps != null ? ` · ${s.reps} reps` : '') +
        (s.weightLb != null ? ` · ${s.weightLb} lb` : '');
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#c9c9c9';
      ctx.fillText(fit(line, W - 160, rowFont), 80, y);
      y += 46;
    });
    if (sets.length > MAX_ROWS) {
      ctx.fillStyle = '#777777';
      ctx.fillText(`+ ${sets.length - MAX_ROWS} more sets`, 80, y);
      y += 46;
    }

    // Footer: app link + credit.
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(80, H - 250, W - 160, 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.fillText('Try WodBuilder free', cx, H - 176);
    ctx.fillStyle = '#e10600';
    ctx.font = '32px system-ui, -apple-system, sans-serif';
    ctx.fillText('vibecode-app.github.io/WodBuilder', cx, H - 126);
    ctx.fillStyle = '#666666';
    ctx.font = '26px system-ui, -apple-system, sans-serif';
    ctx.fillText('Built using Muse (muse.ai)', cx, H - 76);

    const blob: any = await new Promise((resolve) =>
      canvas.toBlob((b: any) => resolve(b), 'image/png')
    );
    if (!blob) return null;
    return new g.File([blob], 'wodbuilder-workout.png', { type: 'image/png' });
  } catch {
    return null;
  }
}
