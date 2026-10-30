import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Share,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useKeepAwake } from 'expo-keep-awake';
import { getWorkout, getHistory, logSession, SessionLog, SetLog } from '../../src/store';
import { parseWorkoutCSV, WorkoutDefinition } from '../../src/csv';
import { buildPhases, formatClock, Phase } from '../../src/engine';
import { playEndSound, playStartSound } from '../../src/audio';
import { renderShareCard } from '../../src/shareCard';

function formatWhen(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit',
  });
  return `${date} · ${time}`;
}

export default function WorkoutPlayer() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [phases, setPhases] = useState<Phase[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [logging, setLogging] = useState(false);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [finished, setFinished] = useState(false);
  const [totalSec, setTotalSec] = useState(0);
  const [confirmStop, setConfirmStop] = useState(false);
  // Preview-first flow: the workout opens read-only; the timer starts only
  // when the user taps Start. Pause freezes the wall-clock countdown.
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [def, setDef] = useState<WorkoutDefinition | null>(null);
  const [wodName, setWodName] = useState('');
  const [estSec, setEstSec] = useState(0);
  const [history, setHistory] = useState<SessionLog[]>([]);
  const [expandedHist, setExpandedHist] = useState<number | null>(null);
  const resumeLeftRef = useRef<number | null>(null);
  const pausedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);

  const endsAtRef = useRef(0);
  const phaseRef = useRef<Phase | null>(null);
  const logsRef = useRef<SetLog[]>([]);
  const [logs, setLogs] = useState<SetLog[]>([]);
  const startedAtRef = useRef(Date.now());

  // Load + parse the workout once.
  useEffect(() => {
    (async () => {
      try {
        const stored = await getWorkout(id ?? '');
        if (!stored) {
          setLoadError('Workout not found.');
          return;
        }
        const parsed = parseWorkoutCSV(stored.csv);
        setDef(parsed);
        setWodName(stored.name);
        setEstSec(stored.estSec);
        setHistory(await getHistory(id ?? ''));
        setPhases(buildPhases(parsed));
      } catch (e: any) {
        setLoadError(e?.message ?? 'Could not load workout.');
      }
    })();
  }, [id]);

  const phase: Phase | null = phases ? phases[phaseIdx] ?? null : null;
  phaseRef.current = phase;

  // Demo video for work phases (loops muted while the timer runs).
  const workVideo = phase?.kind === 'work' ? phase.video : null;
  const player = useVideoPlayer(workVideo, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (!workVideo || !started) return;
    try {
      if (paused) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      /* video is a nice-to-have */
    }
    // Key on the video itself (not phaseIdx): on first load the phases arrive
    // with phaseIdx still 0, so a phaseIdx dep never fires for exercise #1.
  }, [workVideo, started, paused]);

  // Countdown driver: anchored to a wall-clock end time so it stays accurate.
  useEffect(() => {
    if (!phase || phase.kind === 'done' || logging || finished || !started) return;
    if (paused) {
      // Frozen: show the captured remaining time; no interval runs.
      setSecondsLeft(resumeLeftRef.current ?? phase.durationSec);
      return;
    }
    const isResume = resumeLeftRef.current != null;
    const dur = resumeLeftRef.current ?? phase.durationSec;
    resumeLeftRef.current = null;
    endsAtRef.current = Date.now() + dur * 1000;
    setSecondsLeft(dur);
    // Start cue for every exercise — also the end-of-rest signal, since a
    // rest phase always flows straight into the next work phase. Not
    // replayed when resuming from pause.
    if (phase.kind === 'work' && !isResume) playStartSound();
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(t);
        const p = phaseRef.current;
        if (p?.kind === 'work') {
          // End-of-exercise alarm (rest phases end silently here; the
          // next phase's start cue covers them).
          playEndSound();
          // Prefill from the earlier entry when re-doing an exercise,
          // otherwise from the CSV targets.
          const prev = logsRef.current.find(
            (l) => l.name === p.name && l.round === p.round
          );
          setReps(
            prev?.reps != null
              ? String(prev.reps)
              : p.targetReps != null
                ? String(p.targetReps)
                : ''
          );
          setWeight(
            prev?.weightLb != null
              ? String(prev.weightLb)
              : p.targetWeightLb != null
                ? String(p.targetWeightLb)
                : ''
          );
          setLogging(true);
        } else {
          advance();
        }
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseIdx, logging, phases, finished, started, paused]);

  const startWorkout = () => {
    startedAtRef.current = Date.now();
    setStarted(true);
  };

  const togglePause = () => {
    if (paused) {
      pausedTotalRef.current += Date.now() - pausedAtRef.current;
      setPaused(false);
    } else {
      resumeLeftRef.current = Math.max(
        0,
        Math.ceil((endsAtRef.current - Date.now()) / 1000)
      );
      pausedAtRef.current = Date.now();
      setPaused(true);
    }
  };

  const pauseButton = (
    <TouchableOpacity style={styles.pauseButton} onPress={togglePause}>
      <Text style={styles.pauseText}>{paused ? '▶ Resume' : '⏸ Pause'}</Text>
    </TouchableOpacity>
  );

  const advance = () => {
    setLogging(false);
    setPaused(false);
    resumeLeftRef.current = null;
    setPhaseIdx((i) => {
      const next = i + 1;
      if (phases && next < phases.length && phases[next].kind === 'done') {
        finishWorkout();
      }
      return next;
    });
  };

  // Back up to the previous exercise (re-do it or fix its logged sets).
  // Already-logged sets for other exercises are left untouched.
  const goBack = () => {
    if (!phases) return;
    for (let i = phaseIdx - 1; i >= 0; i--) {
      if (phases[i].kind === 'work') {
        setLogging(false);
        setPaused(false);
        resumeLeftRef.current = null;
        setPhaseIdx(i);
        return;
      }
    }
  };
  const canGoBack =
    !!phases && phases.slice(0, phaseIdx).some((p) => p.kind === 'work');

  const finishWorkout = async () => {
    const secs = Math.round(
      (Date.now() - startedAtRef.current - pausedTotalRef.current) / 1000
    );
    setTotalSec(secs);
    try {
      await logSession(id ?? '', logsRef.current, secs);
    } catch {
      /* history is a nice-to-have */
    }
    setFinished(true);
  };

  const submitLog = () => {
    const p = phaseRef.current;
    if (p?.kind === 'work') {
      const entry: SetLog = { name: p.name, round: p.round };
      const r = parseInt(reps.trim(), 10);
      const w = parseFloat(weight.trim());
      if (Number.isFinite(r)) entry.reps = r;
      if (Number.isFinite(w)) entry.weightLb = w;
      // Upsert: re-doing an exercise (via back navigation) replaces its
      // earlier entry instead of duplicating it.
      const idx = logsRef.current.findIndex(
        (l) => l.name === p.name && l.round === p.round
      );
      if (idx >= 0) {
        const next = [...logsRef.current];
        next[idx] = entry;
        logsRef.current = next;
      } else {
        logsRef.current = [...logsRef.current, entry];
      }
      setLogs(logsRef.current);
    }
    advance();
  };

  const endWorkEarly = () => {
    if (paused) {
      // No interval is running while paused; resume with 0 left so the
      // next tick completes the phase immediately.
      resumeLeftRef.current = 0;
      pausedTotalRef.current += Date.now() - pausedAtRef.current;
      setPaused(false);
      return;
    }
    endsAtRef.current = Date.now(); // next tick completes the phase
  };

  // Two-tap stop: first tap arms, second tap quits to the library.
  // The arm resets on every phase change so it can't go off by accident.
  useEffect(() => {
    setConfirmStop(false);
  }, [phaseIdx]);

  const onStopPress = () => {
    if (confirmStop) {
      router.replace('/');
    } else {
      setConfirmStop(true);
      setTimeout(() => setConfirmStop(false), 4000);
    }
  };

  const stopButton = (
    <TouchableOpacity style={styles.stopButton} onPress={onStopPress}>
      <Text style={styles.stopText}>
        {confirmStop ? 'Tap again to stop the workout' : 'Stop workout'}
      </Text>
    </TouchableOpacity>
  );

  const shareSummary = async () => {
    const stored = await getWorkout(id ?? '');
    const wname = stored?.name ?? 'WOD';
    const detail = logsRef.current.map(
      (l) =>
        `R${l.round} · ${l.name}` +
        (l.reps != null ? ` · ${l.reps} reps` : '') +
        (l.weightLb != null ? ` · ${l.weightLb} lb` : '')
    );
    // Share the result as an image card: Facebook turns text+link shares
    // into bare link cards and drops the stats, so the numbers travel in
    // the picture (the card itself carries the app link). The caption is
    // kept URL-free so Facebook has nothing to choke on. Falls back to
    // plain text (also URL-free) if the image can't be shared.
    const textOnly =
      `🏋️ Workout complete — "${wname}" on WodBuilder\n` +
      `${logsRef.current.length} sets · ${formatClock(totalSec)}\n\n` +
      detail.join('\n');
    try {
      const file = await renderShareCard(wname, logsRef.current, totalSec);
      const nav: any = (globalThis as any).navigator;
      if (file && nav && typeof nav.share === 'function') {
        try {
          await nav.share({ files: [file], title: 'WodBuilder workout', text: textOnly });
          return;
        } catch (e: any) {
          // User dismissing the sheet is not a failure — don't fall through.
          if (e && (e.name === 'AbortError' || e.code === 20)) return;
          // Otherwise fall through to the text share below.
        }
      }
    } catch {
      /* fall through to text share */
    }
    try {
      await Share.share({ message: textOnly });
    } catch {
      /* user dismissed */
    }
  };

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError}</Text>
      </View>
    );
  }
  if (!phases || !phase) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e10600" />
      </View>
    );
  }

  // ---- Done / summary ----
  if (finished || phase.kind === 'done') {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.summary}>
        <Text style={styles.doneTitle}>Workout complete</Text>
        <Text style={styles.doneMeta}>
          {logsRef.current.length} sets · {formatClock(totalSec)}
        </Text>
        {logsRef.current.map((l, i) => (
          <Text key={i} style={styles.logRow}>
            R{l.round} · {l.name}
            {l.reps != null ? ` · ${l.reps} reps` : ''}
            {l.weightLb != null ? ` · ${l.weightLb} lb` : ''}
          </Text>
        ))}
        <TouchableOpacity style={styles.shareButton} onPress={shareSummary}>
          <Text style={styles.shareText}>Share result</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.homeButton} onPress={() => router.replace('/')}>
          <Text style={styles.homeText}>Back to library</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ---- Preview (read-only) before the workout starts ----
  if (!started && def) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.overview}>
        <Text style={styles.ovTitle}>{wodName}</Text>
        <Text style={styles.ovMeta}>
          {def.rounds} round{def.rounds === 1 ? '' : 's'} · {def.exercises.length}{' '}
          exercises · ~{formatClock(estSec)}
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={startWorkout}>
          <Text style={styles.primaryText}>Start workout</Text>
        </TouchableOpacity>
        {def.exercises.map((e, i) => (
          <View key={i} style={styles.ovRow}>
            <Text style={styles.ovName}>
              {i + 1}. {e.name}
            </Text>
            <Text style={styles.ovDetail}>
              {e.durationSec}s work · {e.restSec}s rest
              {e.targetReps != null ? ` · ${e.targetReps} reps` : ''}
              {e.targetWeightLb != null ? ` · ${e.targetWeightLb} lb` : ''}
            </Text>
          </View>
        ))}
        <Text style={styles.ovSection}>Past sessions</Text>
        {history.length === 0 ? (
          <Text style={styles.ovEmpty}>
            Not done yet — finished sessions will appear here.
          </Text>
        ) : (
          history.slice(0, 10).map((s, i) => {
            const open = expandedHist === i;
            return (
              <View key={s.completedAt} style={styles.histCard}>
                <TouchableOpacity
                  onPress={() => setExpandedHist(open ? null : i)}
                >
                  <Text style={styles.histWhen}>{formatWhen(s.completedAt)}</Text>
                  <Text style={styles.histMeta}>
                    {formatClock(s.durationSec)} · {s.sets.length} sets
                    {open ? '  ▴' : '  ▾'}
                  </Text>
                </TouchableOpacity>
                {open
                  ? s.sets.map((set, j) => (
                      <Text key={j} style={styles.histSet}>
                        R{set.round} · {set.name}
                        {set.reps != null ? ` · ${set.reps} reps` : ''}
                        {set.weightLb != null ? ` · ${set.weightLb} lb` : ''}
                      </Text>
                    ))
                  : null}
              </View>
            );
          })
        )}
        {history.length > 10 ? (
          <Text style={styles.ovEmpty}>
            Showing the latest 10 of {history.length} sessions.
          </Text>
        ) : null}
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.homeText}>Back to library</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ---- Log reps/weight between work and rest ----
  if (logging && phase.kind === 'work') {
    return (
      <View style={styles.root}>
        <Text style={styles.phaseLabel}>Log it</Text>
        <Text style={styles.exName}>{phase.name}</Text>
        <Text style={styles.targetLine}>
          Round {phase.round}
          {phase.targetReps != null ? ` · target ${phase.targetReps} reps` : ''}
          {phase.targetWeightLb != null ? ` · ${phase.targetWeightLb} lb` : ''}
        </Text>
        <View style={styles.logRow2}>
          <View style={styles.logField}>
            <Text style={styles.logLabel}>Reps</Text>
            <TextInput
              style={styles.logInput}
              value={reps}
              onChangeText={setReps}
              keyboardType="number-pad"
              placeholder="—"
              placeholderTextColor="#666"
            />
          </View>
          <View style={styles.logField}>
            <Text style={styles.logLabel}>Weight (lb)</Text>
            <TextInput
              style={styles.logInput}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor="#666"
            />
          </View>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={submitLog}>
          <Text style={styles.primaryText}>Start rest</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostButton} onPress={submitLog}>
          <Text style={styles.ghostText}>Skip logging</Text>
        </TouchableOpacity>
        {stopButton}
      </View>
    );
  }

  // ---- Work phase ----
  if (phase.kind === 'work') {
    return (
      <View style={styles.root}>
        <Text style={styles.phaseLabel}>
          Round {phase.round} · Exercise {phase.exerciseIndex + 1}
        </Text>
        <Text style={styles.exName}>{phase.name}</Text>
        {workVideo ? (
          <VideoView
            style={styles.video}
            player={player}
            nativeControls={false}
            contentFit="cover"
            playsInline
          />
        ) : (
          <View style={[styles.video, styles.videoFallback]}>
            <Text style={styles.videoFallbackText}>{phase.name}</Text>
          </View>
        )}
        <Text style={styles.timer}>{formatClock(secondsLeft)}</Text>
        {paused ? <Text style={styles.pausedLabel}>PAUSED</Text> : null}
        <Text style={styles.targetLine}>
          {phase.targetReps != null ? `${phase.targetReps} reps` : 'AMRAP'}
          {phase.targetWeightLb != null ? ` · ${phase.targetWeightLb} lb` : ''}
        </Text>
        {pauseButton}
        <TouchableOpacity style={styles.ghostButton} onPress={endWorkEarly}>
          <Text style={styles.ghostText}>End set early</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostButton} onPress={advance}>
          <Text style={styles.ghostText}>Skip exercise</Text>
        </TouchableOpacity>
        {canGoBack ? (
          <TouchableOpacity style={styles.ghostButton} onPress={goBack}>
            <Text style={styles.ghostText}>‹ Previous exercise</Text>
          </TouchableOpacity>
        ) : null}
        {stopButton}
      </View>
    );
  }

  // ---- Rest / round-rest phases ----
  const restTitle = phase.kind === 'roundRest' ? `Round ${phase.nextRound} incoming` : 'Rest';
  const restSub =
    phase.kind === 'roundRest' ? 'Catch your breath' : `Next: ${phase.nextName}`;
  return (
    <View style={[styles.root, styles.restRoot]}>
      <Text style={styles.phaseLabel}>{restTitle}</Text>
      <Text style={styles.timer}>{formatClock(secondsLeft)}</Text>
      {paused ? <Text style={styles.pausedLabel}>PAUSED</Text> : null}
      <Text style={styles.targetLine}>{restSub}</Text>
      {pauseButton}
      <TouchableOpacity style={styles.primaryButton} onPress={advance}>
        <Text style={styles.primaryText}>Skip rest</Text>
      </TouchableOpacity>
      {canGoBack ? (
        <TouchableOpacity style={styles.ghostButton} onPress={goBack}>
          <Text style={styles.ghostText}>‹ Previous exercise</Text>
        </TouchableOpacity>
      ) : null}
      {stopButton}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', padding: 20, justifyContent: 'center' },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  error: { color: '#ff6b6b', fontSize: 16 },
  phaseLabel: {
    color: '#e10600', fontSize: 15, fontWeight: 'bold',
    textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 8,
  },
  exName: { color: '#fff', fontSize: 30, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#141414' },
  videoFallback: { alignItems: 'center', justifyContent: 'center' },
  videoFallbackText: { color: '#666', fontSize: 18 },
  timer: {
    color: '#fff', fontSize: 96, fontWeight: 'bold', textAlign: 'center',
    marginVertical: 16, fontVariant: ['tabular-nums'],
  },
  targetLine: { color: '#ccc', fontSize: 16, textAlign: 'center', marginBottom: 24 },
  restRoot: { alignItems: 'center' },
  primaryButton: {
    backgroundColor: '#e10600', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  ghostButton: { padding: 14, alignItems: 'center', marginTop: 4 },
  ghostText: { color: '#888', fontSize: 15 },
  stopButton: {
    borderWidth: 1, borderColor: '#e10600', borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 12,
  },
  stopText: { color: '#e10600', fontSize: 15, fontWeight: 'bold' },
  logRow2: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  logField: { flex: 1 },
  logLabel: { color: '#999', fontSize: 14, marginBottom: 6 },
  logInput: {
    backgroundColor: '#141414', color: '#fff', borderRadius: 12,
    padding: 16, fontSize: 22, textAlign: 'center',
  },
  summary: { padding: 20, paddingBottom: 48 },
  doneTitle: { color: '#4cd964', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  doneMeta: { color: '#ccc', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  logRow: { color: '#ddd', fontSize: 15, marginTop: 6 },
  overview: { paddingBottom: 40 },
  ovTitle: { color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  ovMeta: { color: '#999', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  ovRow: {
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  ovName: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  ovDetail: { color: '#999', fontSize: 14, marginTop: 2 },
  pauseButton: {
    borderWidth: 1, borderColor: '#888', borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 4,
  },
  pauseText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  pausedLabel: {
    color: '#ffb340', fontSize: 16, fontWeight: 'bold', textAlign: 'center',
    letterSpacing: 2, marginBottom: 8,
  },
  ovSection: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 28, marginBottom: 10 },
  ovEmpty: { color: '#777', fontSize: 14, marginBottom: 8 },
  histCard: { backgroundColor: '#141414', borderRadius: 12, padding: 14, marginBottom: 10 },
  histWhen: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  histMeta: { color: '#999', fontSize: 14, marginTop: 3 },
  histSet: { color: '#ddd', fontSize: 14, marginTop: 6 },
  shareButton: {
    backgroundColor: '#e10600', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 28,
  },
  shareText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  homeButton: {
    borderWidth: 1, borderColor: '#444', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 12,
  },
  homeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
