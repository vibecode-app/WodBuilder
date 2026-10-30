import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { parseWorkoutCSV, WorkoutDefinition } from '../src/csv';
import { findUnknownExercises } from '../src/exercises';
import { saveWorkout } from '../src/store';
import { formatClock, estimateTotalSec } from '../src/engine';
import { SAMPLES } from '../src/sample';

export default function NewWorkout() {
  const params = useLocalSearchParams<{ csv?: string }>();
  const [csv, setCsv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WorkoutDefinition | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);

  // Accept a pre-built CSV (e.g. from the exercise picker).
  useEffect(() => {
    if (typeof params.csv === 'string' && params.csv.length > 0) {
      setCsv(params.csv);
      setPreview(null);
      setError(null);
    }
  }, [params.csv]);

  const onPreview = () => {
    try {
      const def = parseWorkoutCSV(csv);
      setPreview(def);
      setUnknown(findUnknownExercises(def.exercises.map((e) => e.name)));
      setError(null);
    } catch (e: any) {
      setPreview(null);
      setError(e?.message ?? 'Could not parse that CSV.');
    }
  };

  const onSave = async () => {
    if (!preview) return;
    try {
      await saveWorkout(csv);
      router.back();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save.');
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Paste your workout CSV</Text>
      <TextInput
        style={styles.input}
        multiline
        value={csv}
        onChangeText={(t) => {
          setCsv(t);
          setPreview(null);
          setError(null);
        }}
        placeholder={'# workout: Full Body HIIT\n# rounds: 2\n# rest_between_rounds_sec: 120\nexercise,duration_sec,rest_sec,target_reps,target_weight_lb\n...'}
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={styles.samplesLabel}>Or start from a sample:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
      >
        {SAMPLES.map((s) => (
          <TouchableOpacity
            key={s.name}
            style={styles.chip}
            onPress={() => {
              setCsv(s.csv);
              setPreview(null);
              setError(null);
            }}
          >
            <Text style={styles.chipName}>{s.name}</Text>
            <Text style={styles.chipBlurb}>{s.blurb}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.previewButton} onPress={onPreview}>
        <Text style={styles.previewText}>Preview</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {preview ? (
        <View style={styles.card}>
          <Text style={styles.cardName}>{preview.name}</Text>
          <Text style={styles.cardMeta}>
            {preview.rounds} {preview.rounds === 1 ? 'round' : 'rounds'} · {preview.exercises.length} exercises · ~
            {formatClock(estimateTotalSec(preview))} · {preview.restBetweenRoundsSec}s between rounds
          </Text>
          {unknown.length > 0 ? (
            <Text style={styles.warn}>
              No video for: {unknown.join(', ')} — the timer still works, with a placeholder card.
            </Text>
          ) : (
            <Text style={styles.ok}>All {preview.exercises.length} exercises have demo videos.</Text>
          )}
          {preview.exercises.map((e, i) => (
            <Text key={i} style={styles.exRow}>
              {i + 1}. {e.name} — {e.durationSec}s work / {e.restSec}s rest
              {e.targetReps ? ` · ${e.targetReps} reps` : ''}
              {e.targetWeightLb ? ` · ${e.targetWeightLb} lb` : ''}
            </Text>
          ))}
          <TouchableOpacity style={styles.saveButton} onPress={onSave}>
            <Text style={styles.saveText}>Save to library</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity style={styles.aiLinkCard} onPress={() => router.push('/ai')}>
        <Text style={styles.aiLinkTitle}>🤖 Don't have a CSV? Build one with AI</Text>
        <Text style={styles.aiLinkBody}>
          Copy the example prompt, paste it into any AI you use, and paste the
          workout CSV it gives you back.
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 48 },
  label: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  input: {
    backgroundColor: '#141414',
    color: '#fff',
    borderRadius: 12,
    padding: 12,
    minHeight: 220,
    fontSize: 14,
    fontFamily: 'monospace',
    textAlignVertical: 'top',
  },
  samplesLabel: { color: '#999', fontSize: 14, marginTop: 16, marginBottom: 8 },
  chipsContent: { gap: 10, paddingRight: 16 },
  chip: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: '#333',
    borderRadius: 12, padding: 12, minWidth: 140,
  },
  chipName: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  chipBlurb: { color: '#888', fontSize: 12, marginTop: 2 },
  previewButton: {
    backgroundColor: '#e10600', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  previewText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  error: { color: '#ff6b6b', marginTop: 12, fontSize: 14 },
  card: { backgroundColor: '#141414', borderRadius: 12, padding: 16, marginTop: 16 },
  cardName: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  cardMeta: { color: '#ccc', fontSize: 14, marginBottom: 8 },
  warn: { color: '#ffcc00', fontSize: 14, marginBottom: 8 },
  ok: { color: '#4cd964', fontSize: 14, marginBottom: 8 },
  exRow: { color: '#ddd', fontSize: 14, marginTop: 4 },
  saveButton: {
    backgroundColor: '#4cd964', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 16,
  },
  saveText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  aiLinkCard: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: '#4cd964',
    borderRadius: 12, padding: 16, marginTop: 16,
  },
  aiLinkTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 6 },
  aiLinkBody: { color: '#ccc', fontSize: 14, lineHeight: 20 },
});
