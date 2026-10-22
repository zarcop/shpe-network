import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAuth } from '@/auth/session';
import { loadMyHubs, saveMyHubs } from '@/background/data';
import { HubField } from '@/background/hub-field';
import { autofillFromPdf } from '@/background/resume/autofill';
import { addNames, emptyHubs, HUB_KINDS, mergeHubs, type HubKind, type Hubs } from '@/background/hubs';
import { Body, Button, ErrorText, Loading, Screen, Title } from '@/ui/kit';

export default function Background() {
  const { session } = useAuth();
  const [hubs, setHubs] = useState<Hubs | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const userId = session!.user.id;
  useEffect(() => {
    // Never replace what's already on screen (an autofill or edits) with a late initial load.
    loadMyHubs(userId)
      .then((saved) => setHubs((current) => current ?? saved))
      .catch(() => {
        setLoadError('Couldn’t load your background. Check your connection and try again.');
        setHubs(emptyHubs());
      });
  }, [userId]);

  if (!hubs) return <Loading />;

  async function autofill() {
    setError(undefined);
    setNotice(undefined);
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (picked.canceled) return;
    setReading(true);
    const result = await autofillFromPdf(picked.assets[0]);
    setReading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const { hubs: merged, added } = mergeHubs(hubs!, result.hubs);
    setHubs(merged);
    setNotice(
      added
        ? `Added ${added} from your file. Check them, remove anything wrong and add what’s missing.`
        : 'We didn’t find anything new in that file. Add your background below.',
    );
  }

  const add = (kind: HubKind) => (name: string) => setHubs((h) => addNames(h!, kind, [name]));
  const remove = (kind: HubKind) => (name: string) =>
    setHubs((h) => ({ ...h!, [kind]: h![kind].filter((n) => n !== name) }));

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      await saveMyHubs(hubs!);
      router.dismissTo('/');
    } catch {
      setError('Couldn’t save your background. Check your connection and try again.');
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Title>Your background</Title>
      <Body>
        This is what connects you to other people at SHPE: the colleges, companies, majors and country you share.
      </Body>
      <ErrorText>{loadError}</ErrorText>

      <Button title="Autofill from a resume or LinkedIn PDF" variant="secondary" onPress={autofill} busy={reading} />
      <Body>On LinkedIn: open your profile, tap More, then Save to PDF. Your file is read on this device and never uploaded.</Body>
      {notice ? <Body>{notice}</Body> : null}

      {HUB_KINDS.map((kind) => (
        <HubField key={kind} kind={kind} names={hubs[kind]} onAdd={add(kind)} onRemove={remove(kind)} />
      ))}

      <ErrorText>{error}</ErrorText>
      <Button title="Save background" onPress={save} busy={saving} disabled={reading} />
      <Button title="Cancel" variant="secondary" onPress={() => router.dismissTo('/')} />
    </Screen>
  );
}
