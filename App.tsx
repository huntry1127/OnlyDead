import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

type Show = {
  identifier: string;
  title?: string;
  date?: string;
  year?: number | string;
  venue?: string;
  coverage?: string;
  creator?: string;
};
type ArchiveFile = { name: string; format?: string; size?: string };
const ARCHIVE = 'https://archive.org';
const FAVORITES_KEY = 'dead-radio:favorites:v1';
const COLORS = {
  bg: '#101713', panel: '#19231D', panel2: '#202C24', line: '#334138',
  text: '#F4F0E7', muted: '#A8B1A9', green: '#B8D68C', gold: '#E9BD69',
};

function cleanTerm(value: string) {
  return value.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, ' ').trim();
}
function searchUrl(term: string) {
  let q = 'collection:GratefulDead AND mediatype:etree';
  const safe = cleanTerm(term);
  if (safe) {
    if (/^\d{4}$/.test(safe)) q += ` AND year:${safe}`;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(safe)) q += ` AND identifier:*${safe}*`;
    else q += ` AND (title:"${safe}" OR venue:"${safe}" OR coverage:"${safe}" OR identifier:"${safe}")`;
  }
  const params = new URLSearchParams();
  params.set('q', q);
  ['identifier', 'title', 'date', 'year', 'venue', 'coverage', 'creator'].forEach((field) => params.append('fl[]', field));
  params.set('sort[]', 'date desc');
  params.set('rows', '30');
  params.set('page', '1');
  params.set('output', 'json');
  return `${ARCHIVE}/advancedsearch.php?${params.toString()}`;
}
function showYear(show?: Show) {
  return String(show?.year || show?.date?.slice(0, 4) || 'Year unknown');
}
function showLocation(show?: Show) {
  return show?.venue || show?.coverage || show?.creator || 'Live concert recording';
}
function readableTrack(name: string) {
  return name.replace(/\.(mp3|ogg|m4a)$/i, '').replace(/[_-]+/g, ' ').trim();
}
function streamUrl(identifier: string, filename: string) {
  return `${ARCHIVE}/download/${encodeURIComponent(identifier)}/${filename.split('/').map(encodeURIComponent).join('/')}`;
}

export default function App() {
  const player = useAudioPlayer(null, { downloadFirst: false });
  const playback = useAudioPlayerStatus(player);
  const [shows, setShows] = useState<Show[]>([]);
  const [foundCount, setFoundCount] = useState(0);
  const [favorites, setFavorites] = useState<Show[]>([]);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [tracks, setTracks] = useState<ArchiveFile[]>([]);
  const [trackIndex, setTrackIndex] = useState(0);
  const [tab, setTab] = useState<'shows' | 'favorites'>('shows');

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY).then((value) => {
      if (value) setFavorites(JSON.parse(value));
    }).catch(() => undefined);
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => undefined);
  }, []);

  const fetchShows = useCallback(async (term = '') => {
    setBusy(true);
    setError('');
    setActiveQuery(term);
    try {
      const response = await fetch(searchUrl(term));
      if (!response.ok) throw new Error(`Archive search returned ${response.status}.`);
      const json = await response.json();
      setShows((json.response?.docs || []).filter((show: Show) => !!show.identifier));
      setFoundCount(Number(json.response?.numFound || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to the Internet Archive.');
      setShows([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { fetchShows(); }, [fetchShows]);

  const visibleShows = useMemo(() => tab === 'favorites'
    ? favorites
    : shows, [favorites, shows, tab]);

  const toggleFavorite = useCallback(async (show: Show) => {
    const next = favorites.some((item) => item.identifier === show.identifier)
      ? favorites.filter((item) => item.identifier !== show.identifier)
      : [show, ...favorites];
    setFavorites(next);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }, [favorites]);

  const startTrack = useCallback(async (index: number, list = tracks, show = selectedShow) => {
    if (!show || !list[index]) return;
    setTrackIndex(index);
    const track = list[index];
    player.replace({ uri: streamUrl(show.identifier, track.name) });
    player.setActiveForLockScreen(true, {
      title: readableTrack(track.name),
      artist: 'Grateful Dead',
      albumTitle: show.title || `${showYear(show)} concert`,
    });
    player.play();
  }, [player, selectedShow, tracks]);

  const selectShow = useCallback(async (show: Show) => {
    player.pause();
    player.setActiveForLockScreen(false);
    setSelectedShow(show);
    setTracks([]);
    setTrackIndex(0);
    setError('');
    try {
      const response = await fetch(`${ARCHIVE}/metadata/${encodeURIComponent(show.identifier)}`);
      if (!response.ok) throw new Error('Show details are temporarily unavailable.');
      const details = await response.json();
      const files: ArchiveFile[] = (details.files || [])
        .filter((file: ArchiveFile) => /\.(mp3|ogg|m4a)$/i.test(file.name || ''))
        .filter((file: ArchiveFile) => !/(spectrogram|_thumb|_meta|_files|ffp|md5|checksum)/i.test(file.name || ''))
        .sort((a: ArchiveFile, b: ArchiveFile) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      if (!files.length) throw new Error('No browser-playable audio stream is listed for this show.');
      setTracks(files);
      await startTrack(0, files, show);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this show.');
    }
  }, [player, startTrack]);

  const nextTrack = useCallback(() => {
    if (trackIndex + 1 < tracks.length) startTrack(trackIndex + 1);
  }, [startTrack, trackIndex, tracks.length]);
  const previousTrack = useCallback(() => {
    if (trackIndex > 0) startTrack(trackIndex - 1);
  }, [startTrack, trackIndex]);

  useEffect(() => {
    if (playback.didJustFinish && trackIndex + 1 < tracks.length) nextTrack();
  }, [nextTrack, playback.didJustFinish, trackIndex, tracks.length]);

  const surpriseMe = useCallback(() => {
    if (!shows.length) return;
    const show = shows[Math.floor(Math.random() * shows.length)];
    selectShow(show);
  }, [selectShow, shows]);

  const renderShow = ({ item }: { item: Show }) => {
    const saved = favorites.some((show) => show.identifier === item.identifier);
    return (
      <View style={styles.showCard}>
        <View style={styles.cardHead}>
          <Text style={styles.date}>{showYear(item)}{item.date ? `  ·  ${item.date.slice(5, 10)}` : ''}</Text>
          <Pressable onPress={() => toggleFavorite(item)} accessibilityRole="button" accessibilityLabel={saved ? 'Remove favorite' : 'Save favorite'}>
            <Text style={[styles.favorite, saved && styles.favoriteActive]}>{saved ? '★' : '☆'}</Text>
          </Pressable>
        </View>
        <Text style={styles.showTitle} numberOfLines={2}>{item.title || item.identifier}</Text>
        <Text style={styles.location} numberOfLines={1}>{showLocation(item)}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.identifier} numberOfLines={1}>{item.identifier}</Text>
          <Pressable style={styles.playButton} onPress={() => selectShow(item)} accessibilityRole="button">
            <Text style={styles.playButtonText}>▶  PLAY</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const duration = playback.duration || 0;
  const progress = duration ? Math.min(1, playback.currentTime / duration) : 0;
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>✳</Text></View>
          <View style={styles.brandCopy}>
            <Text style={styles.brand}>DEAD ARCHIVE RADIO</Text>
            <Text style={styles.brandSub}>A listener’s field guide</Text>
          </View>
          <View style={styles.streamBadge}><View style={styles.greenDot} /><Text style={styles.streamText}>ARCHIVE STREAM</Text></View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>THE INTERNET ARCHIVE  ·  GRATEFUL DEAD COLLECTION</Text>
          <Text style={styles.hero}>Every show has{ '\n' }its own weather.</Text>
          <Text style={styles.intro}>Browse by year, date, or venue. Choose a show and listen here; recordings stream from Archive.org.</Text>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Year, venue, or show date"
              placeholderTextColor="#849087"
              returnKeyType="search"
              onSubmitEditing={() => { setTab('shows'); fetchShows(query.trim()); }}
              accessibilityLabel="Search recordings"
            />
            <Pressable style={styles.searchButton} onPress={() => { setTab('shows'); fetchShows(query.trim()); }}>
              <Text style={styles.searchButtonText}>SEARCH</Text>
            </Pressable>
          </View>

          <View style={styles.actionsRow}>
            <View style={styles.tabs}>
              <Pressable onPress={() => setTab('shows')} style={[styles.tab, tab === 'shows' && styles.tabActive]}><Text style={[styles.tabText, tab === 'shows' && styles.tabTextActive]}>SHOWS</Text></Pressable>
              <Pressable onPress={() => setTab('favorites')} style={[styles.tab, tab === 'favorites' && styles.tabActive]}><Text style={[styles.tabText, tab === 'favorites' && styles.tabTextActive]}>SAVED {favorites.length ? `· ${favorites.length}` : ''}</Text></Pressable>
            </View>
            <Pressable onPress={surpriseMe} style={styles.surpriseButton}><Text style={styles.surpriseText}>SURPRISE ME ↗</Text></Pressable>
          </View>

          <View style={styles.listHeadingRow}>
            <Text style={styles.listHeading}>{tab === 'favorites' ? 'Saved shows' : activeQuery ? `Search results` : 'Browse the archive'}</Text>
            <Text style={styles.resultCount}>{busy ? 'Searching…' : tab === 'favorites' ? `${visibleShows.length} saved` : `${foundCount.toLocaleString()} recordings`}</Text>
          </View>
          {activeQuery ? <Text style={styles.queryLine}>Showing matches for “{activeQuery}”</Text> : null}
          {error ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageTitle}>The archive is taking a breather</Text>
              <Text style={styles.messageText}>{error}</Text>
              <Pressable onPress={() => fetchShows(activeQuery)}><Text style={styles.retry}>TRY AGAIN</Text></Pressable>
            </View>
          ) : busy ? (
            <View style={styles.loading}><ActivityIndicator color={COLORS.green} /><Text style={styles.loadingText}>Tuning in to the collection…</Text></View>
          ) : visibleShows.length ? (
            <View style={styles.showList}>{visibleShows.map((show) => <View key={show.identifier}>{renderShow({ item: show })}</View>)}</View>
          ) : (
            <View style={styles.messageBox}>
              <Text style={styles.messageTitle}>{tab === 'favorites' ? 'No saved shows yet' : 'No shows found'}</Text>
              <Text style={styles.messageText}>{tab === 'favorites' ? 'Tap the star on any recording to keep it here.' : 'Try a different year, date, or venue.'}</Text>
            </View>
          )}

          {selectedShow && tracks.length > 0 ? (
            <View style={styles.trackPanel}>
              <View style={styles.trackPanelHead}><Text style={styles.listHeading}>Tracks in this recording</Text><Text style={styles.resultCount}>{tracks.length} tracks</Text></View>
              {tracks.slice(0, 18).map((track, index) => (
                <Pressable key={track.name} style={styles.trackRow} onPress={() => startTrack(index)}>
                  <Text style={[styles.trackNumber, index === trackIndex && styles.trackSelected]}>{String(index + 1).padStart(2, '0')}</Text>
                  <Text style={[styles.trackName, index === trackIndex && styles.trackSelected]} numberOfLines={1}>{readableTrack(track.name)}</Text>
                  <Text style={styles.trackPlay}>{index === trackIndex && playback.playing ? '●' : '▶'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.disclaimer}>Independent fan listening interface. Recordings are served by the Internet Archive; availability and access are controlled by the Archive and collection policies. Not affiliated with or endorsed by the Grateful Dead or Internet Archive.</Text>
        </ScrollView>

        <View style={styles.playerPanel}>
          <View style={styles.playerTop}>
            <View style={styles.playerCopy}>
              <Text style={styles.nowPlayingLabel}>{selectedShow ? 'NOW PLAYING' : 'READY WHEN YOU ARE'}</Text>
              <Text style={styles.nowPlayingTitle} numberOfLines={1}>{selectedShow ? selectedShow.title || selectedShow.identifier : 'Choose a show to begin'}</Text>
              <Text style={styles.nowPlayingSub} numberOfLines={1}>{selectedShow ? `${showYear(selectedShow)}  ·  ${tracks[trackIndex] ? readableTrack(tracks[trackIndex].name) : 'Finding streamable tracks…'}` : 'Audio streams from Archive.org'}</Text>
            </View>
            <View style={styles.playControls}>
              <Pressable onPress={previousTrack} style={styles.skipButton} accessibilityLabel="Previous track"><Text style={styles.skipText}>|◀</Text></Pressable>
              <Pressable onPress={() => playback.playing ? player.pause() : player.play()} style={styles.mainPlayButton} accessibilityLabel={playback.playing ? 'Pause' : 'Play'}><Text style={styles.mainPlayText}>{playback.playing ? 'Ⅱ' : '▶'}</Text></Pressable>
              <Pressable onPress={nextTrack} style={styles.skipButton} accessibilityLabel="Next track"><Text style={styles.skipText}>▶|</Text></Pressable>
            </View>
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.timeText}>{formatTime(playback.currentTime || 0)}</Text>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { height: 66, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.line },
  brandMark: { height: 39, width: 39, borderRadius: 22, borderWidth: 1, borderColor: '#758B6D', justifyContent: 'center', alignItems: 'center' },
  brandMarkText: { color: COLORS.gold, fontSize: 21 },
  brandCopy: { marginLeft: 11 },
  brand: { color: COLORS.text, fontSize: 13, letterSpacing: 1.4, fontWeight: '700' },
  brandSub: { color: COLORS.muted, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 3 },
  streamBadge: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 9 },
  greenDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: COLORS.green },
  streamText: { color: COLORS.muted, fontSize: 8, letterSpacing: 1, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 27, paddingBottom: 250 },
  eyebrow: { color: COLORS.green, fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  hero: { color: COLORS.text, fontFamily: 'Georgia', fontSize: 38, lineHeight: 41, marginTop: 12, letterSpacing: -1 },
  intro: { color: '#B9C1B8', fontSize: 13, lineHeight: 19, marginTop: 12, maxWidth: 460 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 19, padding: 7, backgroundColor: COLORS.panel, borderColor: COLORS.line, borderWidth: 1, borderRadius: 11 },
  searchInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, color: COLORS.text, fontSize: 13 },
  searchButton: { paddingHorizontal: 13, paddingVertical: 11, borderRadius: 7, backgroundColor: COLORS.green },
  searchButtonText: { color: '#19231D', fontSize: 10, letterSpacing: 0.7, fontWeight: '800' },
  actionsRow: { marginTop: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabs: { flexDirection: 'row', gap: 16 },
  tab: { paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: COLORS.green },
  tabText: { color: COLORS.muted, fontSize: 9, letterSpacing: 1, fontWeight: '700' },
  tabTextActive: { color: COLORS.text },
  surpriseButton: { borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 7 },
  surpriseText: { color: COLORS.gold, fontSize: 9, letterSpacing: 0.6, fontWeight: '700' },
  listHeadingRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 17, marginBottom: 10 },
  listHeading: { color: COLORS.text, fontFamily: 'Georgia', fontSize: 20 },
  resultCount: { color: COLORS.muted, fontSize: 10 },
  queryLine: { color: COLORS.muted, fontSize: 11, marginBottom: 9 },
  showList: { gap: 10 },
  showCard: { borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.panel, borderRadius: 11, padding: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { color: COLORS.gold, fontSize: 10, letterSpacing: 0.9, fontWeight: '700' },
  favorite: { color: COLORS.muted, fontSize: 20, paddingHorizontal: 3 },
  favoriteActive: { color: COLORS.gold },
  showTitle: { color: COLORS.text, fontFamily: 'Georgia', fontSize: 18, lineHeight: 22, marginTop: 8 },
  location: { color: '#B4BEB5', fontSize: 11, marginTop: 5 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  identifier: { flex: 1, color: '#87948A', fontSize: 8, fontFamily: 'monospace' },
  playButton: { backgroundColor: COLORS.green, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 7 },
  playButtonText: { color: '#172019', fontSize: 9, letterSpacing: 0.7, fontWeight: '800' },
  loading: { paddingVertical: 36, alignItems: 'center', gap: 9 },
  loadingText: { color: COLORS.muted, fontSize: 11 },
  messageBox: { borderWidth: 1, borderColor: COLORS.line, borderStyle: 'dashed', borderRadius: 11, padding: 20, alignItems: 'center', marginTop: 8 },
  messageTitle: { color: COLORS.text, fontFamily: 'Georgia', fontSize: 18, textAlign: 'center' },
  messageText: { color: COLORS.muted, fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 6 },
  retry: { color: COLORS.green, fontWeight: '700', fontSize: 9, letterSpacing: 1, marginTop: 13 },
  trackPanel: { marginTop: 24, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 14 },
  trackPanelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  trackRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#29352C', gap: 12 },
  trackNumber: { color: COLORS.muted, fontSize: 10, width: 22, fontVariant: ['tabular-nums'] },
  trackName: { color: '#D1D6CC', fontSize: 11, flex: 1 },
  trackSelected: { color: COLORS.gold },
  trackPlay: { color: COLORS.green, fontSize: 10, width: 20, textAlign: 'right' },
  disclaimer: { color: '#778278', fontSize: 9, lineHeight: 14, marginTop: 24, marginBottom: 12 },
  playerPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#151E18', borderTopWidth: 1, borderTopColor: '#425044', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  playerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  playerCopy: { flex: 1 },
  nowPlayingLabel: { color: COLORS.green, fontSize: 8, letterSpacing: 1.2, fontWeight: '800' },
  nowPlayingTitle: { color: COLORS.text, fontFamily: 'Georgia', fontSize: 14, marginTop: 4 },
  nowPlayingSub: { color: COLORS.muted, fontSize: 9, marginTop: 3 },
  playControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skipButton: { padding: 5 },
  skipText: { color: '#C2CCBE', fontSize: 13 },
  mainPlayButton: { width: 40, height: 40, borderRadius: 24, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
  mainPlayText: { color: '#172019', fontSize: 15, fontWeight: '800' },
  progressRow: { marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeText: { width: 28, textAlign: 'center', color: COLORS.muted, fontSize: 8, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 3, backgroundColor: '#36443A', flex: 1, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: COLORS.green },
});
