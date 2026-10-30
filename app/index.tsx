import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { listWorkouts, deleteWorkout, renameWorkout, StoredWorkout } from '../src/store';
import { formatClock } from '../src/engine';

function lastDoneLabel(ts?: number): string {
  if (!ts) return 'Not done yet';
  const d = new Date(ts);
  return `Last done ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function Library() {
  const [items, setItems] = useState<StoredWorkout[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const refresh = useCallback(() => {
    (async () => setItems(await listWorkouts()))();
  }, []);
  useFocusEffect(refresh);

  const startRename = (w: StoredWorkout) => {
    setRenameText(w.name);
    setRenamingId(w.id);
  };

  const saveRename = async () => {
    if (renamingId) await renameWorkout(renamingId, renameText);
    setRenamingId(null);
    refresh();
  };

  const onDelete = async (id: string) => {
    if (confirmDelete === id) {
      await deleteWorkout(id);
      setConfirmDelete(null);
      refresh();
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete((cur) => (cur === id ? null : cur)), 3000);
    }
  };

  return (
    <View style={styles.root}>
      <TouchableOpacity style={styles.newButton} onPress={() => router.push('/new')}>
        <Text style={styles.newButtonText}>+ New WOD from CSV</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.aiButton} onPress={() => router.push('/ai')}>
        <Text style={styles.aiButtonText}>🤖 Build WOD with AI</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.pickButton} onPress={() => router.push('/pick')}>
        <Text style={styles.pickButtonText}>Build from exercise list</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.historyButton} onPress={() => router.push('/history')}>
        <Text style={styles.historyButtonText}>📜 Workout history</Text>
      </TouchableOpacity>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No workouts yet</Text>
          <Text style={styles.emptyBody}>
            Ask any AI for a workout CSV built around your equipment, paste it in, and it lands here with demo videos.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(w) => w.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {renamingId === item.id ? (
                <View style={styles.renameWrap}>
                  <TextInput
                    style={styles.renameInput}
                    value={renameText}
                    onChangeText={setRenameText}
                    autoFocus
                    onSubmitEditing={saveRename}
                    returnKeyType="done"
                  />
                  <View style={styles.renameRow}>
                    <TouchableOpacity style={styles.renameSave} onPress={saveRename}>
                      <Text style={styles.renameSaveText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setRenamingId(null)}>
                      <Text style={styles.renameCancel}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.cardMain}
                    onPress={() => router.push({ pathname: '/workout/[id]', params: { id: item.id } })}
                  >
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Text style={styles.cardMeta}>
                      {item.rounds} {item.rounds === 1 ? 'round' : 'rounds'} · {item.exerciseCount} exercises · ~{formatClock(item.estSec)}
                    </Text>
                    <Text style={styles.cardMetaDim}>{lastDoneLabel(item.lastDoneAt)}</Text>
                  </TouchableOpacity>
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.iconButton} onPress={() => startRename(item)}>
                      <Text style={styles.iconText}>✎</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => router.push({ pathname: '/edit/[id]', params: { id: item.id } })}
                    >
                      <Text style={styles.iconText}>📝</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => router.push({ pathname: '/pick', params: { workoutId: item.id } })}
                    >
                      <Text style={styles.iconText}>☰</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton} onPress={() => onDelete(item.id)}>
                      <Text style={[styles.iconText, styles.deleteText]}>
                        {confirmDelete === item.id ? 'Sure?' : '✕'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', padding: 16 },
  newButton: {
    backgroundColor: '#e10600',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  newButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  aiButton: {
    borderWidth: 1, borderColor: '#4cd964', borderRadius: 12,
    padding: 16, alignItems: 'center', marginBottom: 16,
  },
  aiButtonText: { color: '#4cd964', fontSize: 16, fontWeight: 'bold' },
  pickButton: {
    borderWidth: 1, borderColor: '#e10600', borderRadius: 12,
    padding: 16, alignItems: 'center', marginBottom: 16,
  },
  pickButtonText: { color: '#e10600', fontSize: 16, fontWeight: 'bold' },
  historyButton: {
    borderWidth: 1, borderColor: '#444', borderRadius: 12,
    padding: 14, alignItems: 'center', marginBottom: 16,
  },
  historyButtonText: { color: '#ddd', fontSize: 15, fontWeight: 'bold' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptyBody: { color: '#999', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  list: { paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#141414',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardMain: { flex: 1, padding: 16 },
  cardName: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  cardMeta: { color: '#ccc', fontSize: 14, marginBottom: 2 },
  cardMetaDim: { color: '#777', fontSize: 13 },
  cardActions: { justifyContent: 'center', paddingRight: 8 },
  iconButton: { paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  iconText: { color: '#888', fontSize: 18 },
  deleteText: { color: '#e10600', fontWeight: 'bold' },
  renameWrap: { flex: 1, padding: 12 },
  renameInput: {
    backgroundColor: '#222', color: '#fff', borderRadius: 8,
    padding: 10, fontSize: 17, fontWeight: 'bold',
  },
  renameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 16 },
  renameSave: {
    backgroundColor: '#4cd964', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8,
  },
  renameSaveText: { color: '#000', fontWeight: 'bold' },
  renameCancel: { color: '#888', fontSize: 15 },
});
