import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useParentConflict, type ParentConflictProps } from '../shared/useParentConflict';
export function ParentConflict(props: Omit<ParentConflictProps, 'newKey'>) {
  return <Picker key={`${props.familyId}:${props.member.id}:${props.member.version}:${props.name}:${props.kind}`} {...props} newKey={randomUUID} />;
}
function Picker(props: ParentConflictProps) {
  const { selected, select, candidates, mutation } = useParentConflict(props);
  return <View style={{ padding: 16, gap: 12 }}>
    <Text accessibilityRole="header">Choose {props.member.full_name}'s {props.kind}</Text>
    <Text>Matching name: {props.name}. Your choice requires verification.</Text>
    {candidates.isPending && <ActivityIndicator />}
    {candidates.isError && <Text accessibilityRole="alert">{candidates.error.message}</Text>}
    {candidates.data?.map(c => <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ checked: selected === c.id }}
      disabled={mutation.isPending || mutation.isSuccess} onPress={() => select(c.id)}
      style={{ borderWidth: selected === c.id ? 2 : 1, padding: 12, minHeight: 48 }}>
      <Text>{c.full_name}</Text><Text>Node {c.id}</Text>
      <Text>Father node: {c.father_id || 'Unknown'}; Mother node: {c.mother_id || 'Unknown'}</Text>
    </Pressable>)}
    {candidates.data?.length === 0 && <Text>No eligible match. Contact a reviewer.</Text>}
    <Pressable accessibilityRole="button" disabled={!selected || candidates.isFetching || mutation.isPending || mutation.isSuccess}
      onPress={() => mutation.mutate()} style={{ padding: 16, backgroundColor: '#e2e8f0', minHeight: 48 }}>
      <Text>{mutation.isPending ? 'Submitting…' : 'Submit for verification'}</Text>
    </Pressable>
    {mutation.isError && <Text accessibilityRole="alert">{mutation.error.message}</Text>}
    {mutation.isSuccess && <Text accessibilityRole="alert">Submitted for approval.</Text>}
  </View>;
}
