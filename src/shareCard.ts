import { SetLog } from './store';
import { formatClock } from './engine';

// Renders the workout result as a shareable image card (1080x1350 PNG).
// Facebook turns text+link shares into bare link cards and drops the stats,
// so the numbers travel in the picture (the card itself carries the app link).
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

    // Header.
    ctx.textAlign = 'center';
    let y = 104;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px system-ui, -apple-system, sans-serif';
    ctx.fillText('🏋️ Workout complete', cx, y);
    y += 70;
    const nameFont = 'bold 40px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#e10600';
    ctx.fillText(fit(`"${workoutName}"`, W - 120, nameFont), cx, y);
    y += 58;
    ctx.fillStyle = '#999999';
    ctx.font = '32px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${sets.length} sets · ${formatClock(totalSec)}`, cx, y);
    y += 40;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(80, y, W - 160, 2);
    const rowsTop = y + 46;

    // Footer (positioned from the bottom so rows can never overlap it).
    const footerDivY = H - 200;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(80, footerDivY, W - 160, 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
    ctx.fillText('Try WodBuilder free', cx, H - 136);
    ctx.fillStyle = '#e10600';
    ctx.font = '28px system-ui, -apple-system, sans-serif';
    ctx.fillText('vibecode-app.github.io/WodBuilder', cx, H - 94);
    ctx.fillStyle = '#666666';
    ctx.font = '24px system-ui, -apple-system, sans-serif';
    ctx.fillText('Built using Muse (muse.ai)', cx, H - 52);

    // Per-set rows. Two columns when there are many sets so big workouts
    // (up to 40 sets) show every set instead of hiding behind "+N more".
    const twoCol = sets.length > 16;
    const cols = twoCol ? 2 : 1;
    const maxRows = twoCol ? 40 : 20;
    const shown = sets.slice(0, maxRows);
    const rowsPerCol = Math.ceil(shown.length / cols);
    const rowH = 41;
    const rowFont = '25px system-ui, -apple-system, sans-serif';
    const colX = [60, 560];
    const colW = 440;
    ctx.textAlign = 'left';
    shown.forEach((s, i) => {
      const col = Math.floor(i / rowsPerCol);
      const row = i % rowsPerCol;
      const line =
        `R${s.round} · ${s.name}` +
        (s.reps != null ? ` · ${s.reps} reps` : '') +
        (s.weightLb != null ? ` · ${s.weightLb} lb` : '');
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#c9c9c9';
      ctx.fillText(fit(line, colW, rowFont), colX[col], rowsTop + row * rowH);
    });
    if (sets.length > shown.length) {
      const moreY = rowsTop + rowsPerCol * rowH + 34;
      if (moreY < footerDivY - 20) {
        ctx.fillStyle = '#777777';
        ctx.fillText(`+ ${sets.length - shown.length} more sets`, 80, moreY);
      }
    }

    const blob: any = await new Promise((resolve) =>
      canvas.toBlob((b: any) => resolve(b), 'image/png')
    );
    if (!blob) return null;
    return new g.File([blob], 'wodbuilder-workout.png', { type: 'image/png' });
  } catch {
    return null;
  }
}
