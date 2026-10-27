import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  source?: string;
  avg_rating?: number | string;
  num_reviews?: number | string;
};
type CuratedShow = {
  date: string;
  venue: string;
  note?: string;
};
type FanPath = 'darkStar' | 'europe72' | 'may77' | 'laterYears';
type ArchiveFile = { name: string; format?: string; size?: string };
type PlaybackBookmark = { show: Show; trackName: string; trackIndex: number; position: number };
type SourceFilter = 'all' | 'soundboard' | 'audience' | 'matrix';
const ARCHIVE = 'https://archive.org';
const FAVORITES_KEY = 'dead-radio:favorites:v1';
const PLAYBACK_KEY = 'dead-radio:playback:v1';
const COLORS = {
  bg: '#101713', panel: '#19231D', panel2: '#202C24', line: '#334138',
  text: '#F4F0E7', muted: '#A8B1A9', green: '#B8D68C', gold: '#E9BD69',
};

const ARCHIVE_POPULAR: (CuratedShow & { views: string; rank: number })[] = [
  { date: '1977-05-08', venue: 'Barton Hall · Cornell University', views: '1.3M views', rank: 1 },
  { date: '1973-06-10', venue: 'RFK Stadium · Washington, DC', views: '1.2M views', rank: 2 },
  { date: '1973-02-15', venue: 'Dane County Coliseum · Madison, WI', views: '1.0M views', rank: 3 },
  { date: '1987-04-03', venue: 'The Centrum · Worcester, MA', views: '782K views', rank: 4 },
  { date: '1977-05-07', venue: 'Boston Garden · Boston, MA', views: '772K views', rank: 5 },
  { date: '1977-02-26', venue: 'Swing Auditorium · San Bernardino, CA', views: '741K views', rank: 6 },
  { date: '1977-05-09', venue: 'Memorial Auditorium · Buffalo, NY', views: '704K views', rank: 7 },
  { date: '1971-08-06', venue: 'Hollywood Palladium · Los Angeles, CA', views: '555K views', rank: 8 },
  { date: '1995-07-09', venue: 'Soldier Field · Chicago, IL', views: '551K views', rank: 9 },
];

const FAN_PATHS: Record<FanPath, { label: string; title: string; intro: string; shows: CuratedShow[] }> = {
  darkStar: {
    label: 'DARK STAR',
    title: 'Dark Star journeys',
    intro: 'Long-form improvisation and the shows fans point to when they ask for a great Dark Star.',
    shows: [
      { date: '1968-08-23', venue: 'Shrine Exhibition Hall · Los Angeles, CA', note: 'Primal Dead · Dark Star > St. Stephen > The Eleven' },
      { date: '1969-02-28', venue: 'Fillmore West · San Francisco, CA', note: 'Dark Star > St. Stephen > The Eleven' },
      { date: '1970-02-13', venue: 'Fillmore East · New York, NY', note: 'A frequently recommended, exploratory Dark Star' },
      { date: '1972-04-08', venue: 'Wembley Empire Pool · London, England', note: 'Europe ’72 · Dark Star and classic song versions' },
      { date: '1973-11-11', venue: 'Winterland Arena · San Francisco, CA', note: 'Three sets · the run’s only Dark Star' },
      { date: '1974-09-10', venue: 'Alexandra Palace · London, England', note: 'A sprawling Dark Star > Morning Dew' },
    ],
  },
  europe72: {
    label: 'EUROPE ’72',
    title: 'Europe ’72 favorites',
    intro: 'A few fan-recommended stops from the tour, including two Dark Star picks.',
    shows: [
      { date: '1972-04-08', venue: 'Wembley Empire Pool · London, England', note: 'A fan-favorite Dark Star and classic set' },
      { date: '1972-05-04', venue: 'L’Olympia · Paris, France', note: 'A long Dark Star > Sugar Magnolia sequence' },
      { date: '1972-05-11', venue: 'Rotterdam Civic Hall · Rotterdam, Netherlands', note: 'A frequently recommended Europe ’72 night' },
      { date: '1972-04-11', venue: 'Newcastle City Hall · Newcastle, England', note: 'Another recommended stop on the Europe ’72 tour' },
    ],
  },
  may77: {
    label: 'MAY ’77',
    title: 'May ’77 run',
    intro: 'The Archive’s most-viewed cluster and a Reddit favorite run, with very different set lists night to night.',
    shows: [
      { date: '1977-05-07', venue: 'Boston Garden · Boston, MA', note: 'A strong opening night in the run' },
      { date: '1977-05-08', venue: 'Barton Hall · Cornell University', note: 'The famous Scarlet Begonias > Fire on the Mountain' },
      { date: '1977-05-09', venue: 'Memorial Auditorium · Buffalo, NY', note: 'A fan favorite with a great Sugaree' },
      { date: '1977-05-22', venue: 'Sportatorium · Pembroke Pines, FL', note: 'A Reddit favorite, especially the second-set closing stretch' },
    ],
  },
  laterYears: {
    label: 'LATER YEARS',
    title: 'Later-year standouts',
    intro: 'Picks from the discussion for listeners who want to move beyond the early ’70s and May ’77.',
    shows: [
      { date: '1976-07-18', venue: 'Orpheum Theatre · San Francisco, CA', note: 'A fan-described smooth, flowing show' },
      { date: '1984-10-12', venue: 'Augusta Civic Center · Augusta, ME', note: 'Recommended in the debate over the Halloween ’84 pick' },
      { date: '1984-10-15', venue: 'Hartford Civic Center · Hartford, CT', note: 'Another suggested show from the same ’84 run' },
      { date: '1984-11-02', venue: 'Berkeley Community Theatre · Berkeley, CA', note: 'A commenter who attended preferred it to Halloween night' },
    ],
  },
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
  ['identifier', 'title', 'date', 'year', 'venue', 'coverage', 'creator', 'source', 'avg_rating', 'num_reviews'].forEach((field) => params.append('fl[]', field));
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
function sourceKind(show?: Show): Exclude<SourceFilter, 'all'> | 'other' {
  const source = `${show?.source || ''} ${show?.title || ''}`.toLowerCase();
  if (/\b(matrix|mtx)\b/.test(source)) return 'matrix';
  if (/\b(sbd|soundboard|board)\b/.test(source)) return 'soundboard';
  if (/\b(aud|audience)\b/.test(source)) return 'audience';
  return 'other';
}
function sourceLabel(show?: Show) {
  const kind = sourceKind(show);
  if (kind === 'soundboard') return 'SOUNDBOARD';
  if (kind === 'audience') return 'AUDIENCE';
  if (kind === 'matrix') return 'MATRIX';
  return 'SOURCE UNLISTED';
}
function readableTrack(name: string) {
  return name.replace(/\.(mp3|ogg|m4a)$/i, '').replace(/[_-]+/g, ' ').trim();
}
function streamUrl(identifier: string, filename: string) {
  return `${ARCHIVE}/download/${encodeURIComponent(identifier)}/${filename.split('/').map(encodeURIComponent).join('/')}`;
}

function RadioApp() {
  const insets = useSafeAreaInsets();
  const player = useAudioPlayer(null, { downloadFirst: false, updateInterval: 1000 });
  const playback = useAudioPlayerStatus(player);
  const [shows, setShows] = useState<Show[]>([]);
  const [foundCount, setFoundCount] = useState(0);
  const [favorites, setFavorites] = useState<Show[]>([]);
  const [lastListen, setLastListen] = useState<PlaybackBookmark | null>(null);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [tracks, setTracks] = useState<ArchiveFile[]>([]);
  const [trackIndex, setTrackIndex] = useState(0);
  const [tab, setTab] = useState<'shows' | 'favorites'>('shows');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [fanPath, setFanPath] = useState<FanPath>('darkStar');
  const [restoring, setRestoring] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const pendingSeekRef = useRef<{ seconds: number; shouldPlay: boolean } | null>(null);
  const lastSaveAtRef = useRef(0);
  const finishHandledRef = useRef(false);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(FAVORITES_KEY), AsyncStorage.getItem(PLAYBACK_KEY)])
      .then(([savedFavorites, savedPlayback]) => {
        if (savedFavorites) setFavorites(JSON.parse(savedFavorites));
        if (savedPlayback) setLastListen(JSON.parse(savedPlayback));
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

  useEffect(() => {
    const timer = setTimeout(() => { void fetchShows(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchShows]);

  const visibleShows = useMemo(() => tab === 'favorites'
    ? favorites
    : shows, [favorites, shows, tab]).filter((show) => sourceFilter === 'all' || sourceKind(show) === sourceFilter);

  const saveBookmark = useCallback(async (bookmark: PlaybackBookmark) => {
    setLastListen(bookmark);
    try { await AsyncStorage.setItem(PLAYBACK_KEY, JSON.stringify(bookmark)); } catch { /* resume is best effort */ }
  }, []);

  useEffect(() => {
    const currentTrack = tracks[trackIndex];
    if (!selectedShow || !currentTrack || !playback.isLoaded) return;
    const now = Date.now();
    if (now - lastSaveAtRef.current < 5000 && playback.playing) return;
    lastSaveAtRef.current = now;
    void saveBookmark({
      show: selectedShow,
      trackName: currentTrack.name,
      trackIndex,
      position: Math.max(0, playback.currentTime || 0),
    });
  }, [playback.currentTime, playback.isLoaded, playback.playing, saveBookmark, selectedShow, trackIndex, tracks]);

  useEffect(() => {
    const pendingSeek = pendingSeekRef.current;
    if (!pendingSeek || !playback.isLoaded) return;
    pendingSeekRef.current = null;
    player.seekTo(pendingSeek.seconds).then(() => {
      if (pendingSeek.shouldPlay) player.play();
    }).catch(() => setPlaybackError('Could not restore this stream position. Tap retry to start this track again.'));
  }, [playback.isLoaded, player]);

  const toggleFavorite = useCallback(async (show: Show) => {
    const next = favorites.some((item) => item.identifier === show.identifier)
      ? favorites.filter((item) => item.identifier !== show.identifier)
      : [show, ...favorites];
    setFavorites(next);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }, [favorites]);

  const startTrack = useCallback(async (index: number, list = tracks, show = selectedShow) => {
    if (!show || !list[index]) return;
    pendingSeekRef.current = null;
    setPlaybackError('');
    setTrackIndex(index);
    const track = list[index];
    player.replace({ uri: streamUrl(show.identifier, track.name) });
    player.setActiveForLockScreen(true, {
      title: readableTrack(track.name),
      artist: 'Grateful Dead',
      albumTitle: show.title || `${showYear(show)} concert`,
    }, {
      showSeekBackward: true,
      showSeekForward: true,
    });
    player.play();
    void saveBookmark({ show, trackName: track.name, trackIndex: index, position: 0 });
  }, [player, saveBookmark, selectedShow, tracks]);

  const selectShow = useCallback(async (show: Show, resume?: PlaybackBookmark) => {
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
      const matchingTrack = resume ? files.findIndex((file) => file.name === resume.trackName) : -1;
      const selectedIndex = matchingTrack >= 0 ? matchingTrack : Math.min(resume?.trackIndex || 0, files.length - 1);
      setTracks(files);
      if (resume) {
        setTrackIndex(selectedIndex);
        setPlaybackError('');
        const track = files[selectedIndex];
        player.replace({ uri: streamUrl(show.identifier, track.name) });
        player.setActiveForLockScreen(true, {
          title: readableTrack(track.name),
          artist: 'Grateful Dead',
          albumTitle: show.title || `${showYear(show)} concert`,
        }, { showSeekBackward: true, showSeekForward: true });
        pendingSeekRef.current = { seconds: Math.max(0, resume.position), shouldPlay: true };
        void saveBookmark({ show, trackName: track.name, trackIndex: selectedIndex, position: resume.position });
      } else {
        await startTrack(0, files, show);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this show.');
    }
  }, [player, saveBookmark, startTrack]);

  const openCuratedShow = useCallback(async (curated: CuratedShow) => {
    setBusy(true);
    setError('');
    setTab('shows');
    setSourceFilter('all');
    setQuery(curated.date);
    setActiveQuery(curated.date);
    try {
      const response = await fetch(searchUrl(curated.date));
      if (!response.ok) throw new Error(`Archive search returned ${response.status}.`);
      const json = await response.json();
      const matches: Show[] = (json.response?.docs || []).filter((show: Show) => !!show.identifier);
      if (!matches.length) throw new Error('No Archive recordings were found for that date.');
      const ranked = [...matches].sort((a, b) => {
        const ratingDifference = Number(b.avg_rating || 0) - Number(a.avg_rating || 0);
        if (ratingDifference) return ratingDifference;
        return Number(b.num_reviews || 0) - Number(a.num_reviews || 0);
      });
      setShows(ranked);
      setFoundCount(Number(json.response?.numFound || ranked.length));
      await selectShow(ranked[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that Archive show.');
    } finally {
      setBusy(false);
    }
  }, [selectShow]);

  const resumeLastListen = useCallback(async () => {
    if (!lastListen) return;
    setRestoring(true);
    await selectShow(lastListen.show, lastListen);
    setRestoring(false);
  }, [lastListen, selectShow]);

  const nextTrack = useCallback(() => {
    if (trackIndex + 1 < tracks.length) startTrack(trackIndex + 1);
  }, [startTrack, trackIndex, tracks.length]);
  const previousTrack = useCallback(() => {
    if (trackIndex > 0) startTrack(trackIndex - 1);
  }, [startTrack, trackIndex]);

  const retryCurrentTrack = useCallback(() => {
    const track = tracks[trackIndex];
    if (!selectedShow || !track) return;
    setPlaybackError('');
    pendingSeekRef.current = { seconds: Math.max(0, playback.currentTime || 0), shouldPlay: true };
    player.pause();
    player.replace({ uri: streamUrl(selectedShow.identifier, track.name) });
    player.setActiveForLockScreen(true, {
      title: readableTrack(track.name),
      artist: 'Grateful Dead',
      albumTitle: selectedShow.title || `${showYear(selectedShow)} concert`,
    }, { showSeekBackward: true, showSeekForward: true });
  }, [playback.currentTime, player, selectedShow, trackIndex, tracks]);

  useEffect(() => {
    if (playback.didJustFinish && !finishHandledRef.current) {
      finishHandledRef.current = true;
      if (trackIndex + 1 < tracks.length) {
        const timer = setTimeout(() => nextTrack(), 0);
        return () => clearTimeout(timer);
      }
    } else if (!playback.didJustFinish) {
      finishHandledRef.current = false;
    }
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
        <View style={styles.metadataRow}>
          <Text style={styles.sourcePill}>{sourceLabel(item)}</Text>
          {Number(item.avg_rating) > 0 ? <Text style={styles.rating}>★ {Number(item.avg_rating).toFixed(1)} Archive rating</Text> : null}
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.identifier} numberOfLines={1}>{item.identifier}</Text>
          <Pressable style={styles.playButton} onPress={() => selectShow(item)} accessibilityRole="button">
            <Text style={styles.playButtonText}>▶  PLAY</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderCuratedCard = (item: CuratedShow & { views?: string; rank?: number }) => (
    <View key={`${item.date}-${item.venue}`} style={styles.curatedCard}>
      <View style={styles.curatedCardTop}>
        {typeof item.rank === 'number' ? <Text style={styles.curatedRank}>#{String(item.rank).padStart(2, '0')}</Text> : <View style={styles.curatedSpark}><Text style={styles.curatedSparkText}>✳</Text></View>}
        {item.views ? <Text style={styles.curatedViews}>{item.views}</Text> : <Text style={styles.curatedPick}>FAN PICK</Text>}
      </View>
      <Text style={styles.curatedDate}>{item.date}</Text>
      <Text style={styles.curatedVenue} numberOfLines={2}>{item.venue}</Text>
      {item.note ? <Text style={styles.curatedNote} numberOfLines={2}>{item.note}</Text> : null}
      <Pressable style={styles.curatedPlay} onPress={() => openCuratedShow(item)} accessibilityRole="button" accessibilityLabel={`Play show from ${item.date}`}>
        <Text style={styles.curatedPlayText}>PLAY SHOW  ↗</Text>
      </Pressable>
    </View>
  );

  const duration = playback.duration || 0;
  const progress = duration ? Math.min(1, playback.currentTime / duration) : 0;
  const visiblePlaybackError = playback.error ? 'This stream was interrupted. Retry the track to reconnect.' : playbackError;
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Image source={require('./assets/onlydead-logo.png')} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="OnlyDead logo" />
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.brand}>DEAD ARCHIVE RADIO</Text>
            <Text style={styles.brandSub}>A listener’s field guide</Text>
          </View>
          <View style={styles.streamBadge}><View style={styles.greenDot} /><Text style={styles.streamText}>ARCHIVE STREAM</Text></View>
        </View>

        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 250 + insets.bottom }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>THE INTERNET ARCHIVE  ·  GRATEFUL DEAD COLLECTION</Text>
          <Text style={styles.hero}>Every show has{ '\n' }its own weather.</Text>
          <Text style={styles.intro}>Browse by year, date, or venue. Choose a show and listen here; recordings stream from Archive.org.</Text>

          {tab === 'shows' ? (
            <View style={styles.discovery}>
              <View style={styles.discoveryHeading}>
                <View style={styles.discoveryTitleGroup}>
                  <Text style={styles.discoveryKicker}>THE ARCHIVE’S MOST-VIEWED RECORDINGS</Text>
                  <Text style={styles.discoveryTitle}>Popular on the Archive</Text>
                </View>
                <Text style={styles.snapshot}>LATE 2024 SNAPSHOT</Text>
              </View>
              <Text style={styles.discoveryIntro}>Top nine distinct show dates from the Archive’s late-2024 view snapshot. Cornell appears once, though the Archive counted two recordings of that show.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.curatedRail}>
                {ARCHIVE_POPULAR.map(renderCuratedCard)}
              </ScrollView>
              <View style={[styles.discoveryHeading, styles.fanHeading]}>
                <View style={styles.discoveryTitleGroup}>
                  <Text style={styles.discoveryKicker}>PICKS FROM DEADHEAD DISCUSSIONS</Text>
                  <Text style={styles.discoveryTitle}>Fan recommended</Text>
                </View>
                <Text style={styles.snapshot}>NOT A RATING</Text>
              </View>
              <Text style={styles.discoveryIntro}>Explore by era or the kind of playing you want to hear.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pathRail}>
                {(Object.keys(FAN_PATHS) as FanPath[]).map((path) => (
                  <Pressable key={path} onPress={() => setFanPath(path)} style={[styles.pathChip, fanPath === path && styles.pathChipActive]}>
                    <Text style={[styles.pathChipText, fanPath === path && styles.pathChipTextActive]}>{FAN_PATHS[path].label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.fanPathCopy}>
                <Text style={styles.fanPathTitle}>{FAN_PATHS[fanPath].title}</Text>
                <Text style={styles.fanPathIntro}>{FAN_PATHS[fanPath].intro}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.curatedRail}>
                {FAN_PATHS[fanPath].shows.map(renderCuratedCard)}
              </ScrollView>
            </View>
          ) : null}

          {lastListen && !selectedShow ? (
            <Pressable style={styles.resumeCard} onPress={resumeLastListen} disabled={restoring} accessibilityRole="button">
              <View style={styles.resumeCopy}>
                <Text style={styles.resumeEyebrow}>{restoring ? 'RECONNECTING TO YOUR SHOW' : 'PICK UP WHERE YOU LEFT OFF'}</Text>
                <Text style={styles.resumeTitle} numberOfLines={1}>{lastListen.show.title || lastListen.show.identifier}</Text>
                <Text style={styles.resumeSub}>{showYear(lastListen.show)}  ·  {readableTrack(lastListen.trackName)}  ·  {formatTime(lastListen.position)}</Text>
              </View>
              {restoring ? <ActivityIndicator color={COLORS.green} /> : <Text style={styles.resumeAction}>RESUME ↗</Text>}
            </Pressable>
          ) : null}

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

          <View style={styles.sourceFilters}>
            {([
              ['all', 'ALL SOURCES'], ['soundboard', 'SOUNDBOARD'], ['audience', 'AUDIENCE'], ['matrix', 'MATRIX'],
            ] as [SourceFilter, string][]).map(([value, label]) => (
              <Pressable key={value} onPress={() => setSourceFilter(value)} style={[styles.sourceFilter, sourceFilter === value && styles.sourceFilterActive]}>
                <Text style={[styles.sourceFilterText, sourceFilter === value && styles.sourceFilterTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {sourceFilter !== 'all' ? <Text style={styles.filterNote}>Source filters apply to the shows currently loaded.</Text> : null}

          <View style={styles.listHeadingRow}>
            <Text style={styles.listHeading}>{tab === 'favorites' ? 'Saved shows' : activeQuery ? `Search results` : 'Browse the archive'}</Text>
            <Text style={styles.resultCount}>{busy ? 'Searching…' : tab === 'favorites' ? `${visibleShows.length} saved` : sourceFilter === 'all' ? `${foundCount.toLocaleString()} recordings` : `${visibleShows.length} loaded`}</Text>
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
          {visiblePlaybackError ? (
            <View style={styles.playbackErrorRow}>
              <Text style={styles.playbackErrorText} numberOfLines={2}>{visiblePlaybackError}</Text>
              <Pressable onPress={retryCurrentTrack} style={styles.retryTrackButton}>
                <Text style={styles.retryTrackText}>RETRY</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <RadioApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { height: 82, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.line },
  brandMark: { height: 62, width: 62, borderRadius: 8, borderWidth: 1, borderColor: '#758B6D', backgroundColor: '#010001', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  brandLogo: { height: 60, width: 60 },
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
  resumeCard: { marginTop: 15, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: '#647A54', backgroundColor: '#1C2A20', flexDirection: 'row', alignItems: 'center', gap: 10 },
  resumeCopy: { flex: 1 },
  resumeEyebrow: { color: COLORS.green, fontSize: 8, letterSpacing: 1, fontWeight: '800' },
  resumeTitle: { color: COLORS.text, fontFamily: 'Georgia', fontSize: 16, marginTop: 5 },
  resumeSub: { color: COLORS.muted, fontSize: 9, marginTop: 4 },
  resumeAction: { color: COLORS.gold, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
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
  sourceFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  sourceFilter: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 15, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.panel },
  sourceFilterActive: { borderColor: COLORS.green, backgroundColor: '#253428' },
  sourceFilterText: { color: COLORS.muted, fontSize: 8, letterSpacing: 0.5, fontWeight: '700' },
  sourceFilterTextActive: { color: COLORS.green },
  filterNote: { color: COLORS.muted, fontSize: 9, marginTop: 6 },
  discovery: { marginTop: 24, marginHorizontal: -20, paddingLeft: 20, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 20 },
  discoveryHeading: { paddingRight: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  discoveryTitleGroup: { flex: 1 },
  discoveryKicker: { color: COLORS.green, fontSize: 8, letterSpacing: 1.2, fontWeight: '800' },
  discoveryTitle: { color: COLORS.text, fontFamily: 'Georgia', fontSize: 23, marginTop: 5 },
  snapshot: { color: COLORS.muted, fontSize: 7, letterSpacing: 0.5, fontWeight: '700', paddingBottom: 3 },
  discoveryIntro: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 7, marginBottom: 11, paddingRight: 25, maxWidth: 460 },
  curatedRail: { gap: 9, paddingRight: 20, paddingBottom: 2 },
  curatedCard: { width: 226, minHeight: 177, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.panel, borderRadius: 10, padding: 12 },
  curatedCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  curatedRank: { color: COLORS.gold, fontFamily: 'Georgia', fontSize: 16 },
  curatedSpark: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#27362B', alignItems: 'center', justifyContent: 'center' },
  curatedSparkText: { color: COLORS.green, fontSize: 13 },
  curatedViews: { color: COLORS.gold, fontSize: 9, fontWeight: '700' },
  curatedPick: { color: COLORS.green, fontSize: 8, letterSpacing: 0.8, fontWeight: '800' },
  curatedDate: { color: COLORS.text, fontFamily: 'Georgia', fontSize: 17, marginTop: 12 },
  curatedVenue: { color: '#C2CBC1', fontSize: 10, lineHeight: 14, marginTop: 4, minHeight: 28 },
  curatedNote: { color: COLORS.muted, fontSize: 9, lineHeight: 13, marginTop: 7, minHeight: 26 },
  curatedPlay: { alignSelf: 'flex-start', backgroundColor: '#B8D68C', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, marginTop: 'auto' },
  curatedPlayText: { color: '#172019', fontSize: 8, letterSpacing: 0.5, fontWeight: '800' },
  fanHeading: { marginTop: 24 },
  pathRail: { gap: 7, paddingRight: 20, paddingBottom: 2 },
  pathChip: { borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.panel, borderRadius: 15, paddingHorizontal: 10, paddingVertical: 7 },
  pathChipActive: { borderColor: COLORS.green, backgroundColor: '#253428' },
  pathChipText: { color: COLORS.muted, fontSize: 8, letterSpacing: 0.5, fontWeight: '700' },
  pathChipTextActive: { color: COLORS.green },
  fanPathCopy: { paddingRight: 20, marginTop: 11, marginBottom: 9 },
  fanPathTitle: { color: COLORS.text, fontFamily: 'Georgia', fontSize: 16 },
  fanPathIntro: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: 4, maxWidth: 450 },
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
  metadataRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  sourcePill: { color: COLORS.green, borderWidth: 1, borderColor: '#50634A', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10, fontSize: 8, letterSpacing: 0.4, fontWeight: '700' },
  rating: { color: COLORS.gold, fontSize: 9, fontWeight: '700' },
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
  playbackErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  playbackErrorText: { color: '#E5B88E', flex: 1, fontSize: 9 },
  retryTrackButton: { borderWidth: 1, borderColor: '#765C3C', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6 },
  retryTrackText: { color: COLORS.gold, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
});
