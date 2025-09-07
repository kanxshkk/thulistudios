/**
 * Stylist App - Final Version
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

// --- Firebase Initialization ---
import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    query,
    limit,
    getDocs
} from 'firebase/firestore';


const firebaseConfig = {
  apiKey: "AIzaSyDxNf21lx04ZoFTciMXRXVqkTkV5G9YfLg",
  authDomain: "thuli-web-scrape.firebaseapp.com",
  projectId: "thuli-web-scrape",
  storageBucket: "thuli-web-scrape.firebasestorage.app",
  messagingSenderId: "263219111847",
  appId: "1:263219111847:web:bbdbaea521c6b9eaf9b882"
};


const FIREBASE_APP = initializeApp(firebaseConfig);
const FIREBASE_AUTH = initializeAuth(FIREBASE_APP, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
const FIREBASE_DB = getFirestore(FIREBASE_APP);


// --- Constants ---
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SWIPE_THRESHOLD = 0.25 * SCREEN_WIDTH;
const QUIZ_LENGTH = 10;


// --- Recommendation Logic ---
const recommendOutfits = (likedItems, dislikedItems, inventory) => {
    if (likedItems.length === 0 || inventory.length === 0) {
        return inventory.slice(0, 10).map(item => ({ ...item, reason: "Some popular styles to start!" }));
    }

    const TAG_WEIGHTS = { style: 5, occasion: 4, garment_type: 3, fitting: 2, color: 1 };
    const likedTags = {};
    likedItems.forEach(item => {
        Object.keys(item.tags).forEach(key => {
            const value = item.tags[key];
            if (!likedTags[key]) likedTags[key] = {};
            likedTags[key][value] = (likedTags[key][value] || 0) + 1;
        });
    });

    const scoredInventory = inventory.map(item => {
        let score = 0;
        let matchedTags = [];
        Object.keys(item.tags).forEach(key => {
            const value = item.tags[key];
            const weight = TAG_WEIGHTS[key] || 1;
            if (likedTags[key] && likedTags[key][value]) {
                score += likedTags[key][value] * weight;
                 if(key === 'style' || key === 'occasion') {
                    matchedTags.push(value);
                }
            }
        });
        
        const isSeen = likedItems.some(i => i.id === item.id) || dislikedItems.some(i => i.id === item.id);
        if (isSeen) score = -Infinity;
        
        const reason = matchedTags.length > 0 
            ? `Because you like ${[...new Set(matchedTags)].slice(0, 2).join(' & ')}`
            : "A popular style you might like";

        return { ...item, score, reason };
    });

    return scoredInventory.sort((a, b) => b.score - a.score).slice(0, 10);
};


// --- Main App Component ---
export default function App() {
  const [appState, setAppState] = useState('loading');
  const [user, setUser] = useState(null);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [fullInventory, setFullInventory] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [likedItems, setLikedItems] = useState([]);
  const [dislikedItems, setDislikedItems] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  const position = useRef(new Animated.ValueXY()).current;
  
  useEffect(() => {
    const fetchInitialData = async () => {
        try {
            const quizQuery = query(collection(FIREBASE_DB, "inventory"), limit(QUIZ_LENGTH));
            const quizSnapshot = await getDocs(quizQuery);
            setQuizQuestions(quizSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            const inventorySnapshot = await getDocs(collection(FIREBASE_DB, "inventory"));
            setFullInventory(inventorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error("Error fetching inventory data:", error);
            Alert.alert("CRITICAL ERROR", "Could not load style inventory. Please update your Firebase security rules..");
        }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(FIREBASE_AUTH, (newUser) => {
      if (newUser) {
        setUser(newUser);
      } else {
        setUser(null);
        setAppState('auth');
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleUserLogin = async () => {
        if (user && fullInventory.length > 0) {
            const userDocRef = doc(FIREBASE_DB, "userPreferences", user.uid);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists() && docSnap.data().likedItemIds?.length > 0) {
                const prefs = docSnap.data();
                const findItemById = (id) => fullInventory.find(item => item.id === id);
                const loadedLikes = prefs.likedItemIds.map(findItemById).filter(Boolean);
                const loadedDislikes = (prefs.dislikedItemIds || []).map(findItemById).filter(Boolean);
                
                setLikedItems(loadedLikes);
                setDislikedItems(loadedDislikes);

                const recs = recommendOutfits(loadedLikes, loadedDislikes, fullInventory);
                setRecommendations(recs);
                setAppState('results');
            } else {
                setLikedItems([]);
                setDislikedItems([]);
                setCurrentQuizIndex(0);
                setAppState('quiz');
            }
        }
    };
    handleUserLogin();
  }, [user, fullInventory]);

  // --- Functions ---
  const handleAuth = async () => { if (!email || !password) return; setAuthLoading(true); try { if (isLogin) { await signInWithEmailAndPassword(FIREBASE_AUTH, email, password); } else { await createUserWithEmailAndPassword(FIREBASE_AUTH, email, password); } } catch (error) { Alert.alert("Authentication Failed", error.message); } finally { setAuthLoading(false); } };
  const handleSignOut = () => { signOut(FIREBASE_AUTH); };
  const saveUserPreferences = async (uid, likes, dislikes) => { if (!uid) return; try { const userDocRef = doc(FIREBASE_DB, "userPreferences", uid); await setDoc(userDocRef, { likedItemIds: likes.map(item => item.id), dislikedItemIds: dislikes.map(item => item.id), }); } catch (error) { console.error("Error saving preferences: ", error); } };
  
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gs) => position.setValue({ x: gs.dx, y: 0 }),
    onPanResponderRelease: (_, gs) => {
      if (gs.dx > SWIPE_THRESHOLD) forceSwipe('right');
      else if (gs.dx < -SWIPE_THRESHOLD) forceSwipe('left');
      else resetPosition();
    },
  }), [currentQuizIndex, quizQuestions]);

  const forceSwipe = (direction) => Animated.timing(position, { toValue: { x: direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5, y: 0 }, duration: 400, useNativeDriver: false, }).start(() => onSwipeComplete(direction));
  const resetPosition = () => Animated.spring(position, { toValue: { x: 0, y: 0 }, speed: 10, bounciness: 5, useNativeDriver: false }).start();
  
  const onSwipeComplete = async (direction) => {
    if (quizQuestions.length === 0) return;
    const item = quizQuestions[currentQuizIndex];
    const updatedLikes = direction === 'right' ? [...likedItems, item] : likedItems;
    const updatedDislikes = direction === 'left' ? [...dislikedItems, item] : dislikedItems;
    
    setLikedItems(updatedLikes);
    setDislikedItems(updatedDislikes);

    if (user) await saveUserPreferences(user.uid, updatedLikes, updatedDislikes);
    
    position.setValue({ x: 0, y: 0 });

    if (currentQuizIndex + 1 >= quizQuestions.length) {
        const recs = recommendOutfits(updatedLikes, updatedDislikes, fullInventory);
        setRecommendations(recs);
        setAppState('results');
    } else {
        setCurrentQuizIndex(prev => prev + 1);
    }
  };
  
  const restartQuiz = () => { setCurrentQuizIndex(0); setAppState('quiz'); };

  const rotateAndTranslate = { transform: [{ rotate: position.x.interpolate({ inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2], outputRange: ['-15deg', '0deg', '15deg'], extrapolate: 'clamp' }) }, { translateX: position.x }] };
  const likeOpacity = position.x.interpolate({ inputRange: [20, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeOpacity = position.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, -20], outputRange: [1, 0], extrapolate: 'clamp' });
  const nextCardScale = position.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD], outputRange: [1, 0.9, 1], extrapolate: 'clamp' });

  // --- RENDER FUNCTIONS ---
  const renderLoadingScreen = () => <View style={styles.centerContainer}><ActivityIndicator size="large" color="#fff" /><Text style={[styles.loadingText, {color: '#fff'}]}>Loading...</Text></View>;
  const renderAuthScreen = () => (
    <View style={styles.authContainer}>
      <Text style={styles.authTitle}>Style<Text style={{fontWeight: '300'}}>Me</Text></Text>
      <Text style={styles.authSubtitle}>Find your perfect look</Text>
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#999" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#999" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.authButton} onPress={handleAuth} disabled={authLoading}>
        {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.authButtonText}>{isLogin ? 'Login' : 'Sign Up'}</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
        <Text style={styles.toggleAuthText}>{isLogin ? 'Need an account? Sign Up' : 'Have an account? Login'}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderQuizScreen = () => {
    if (quizQuestions.length === 0) return renderLoadingScreen();
    return (
      <View style={{ flex: 1, paddingTop: 20 }}>
        <View style={styles.quizHeader}>
          <Text style={styles.quizHeaderText}>Discover Your Style</Text>
          <Text style={styles.quizHeaderSubText}>Which look is more you?</Text>
        </View>
        <View style={styles.quizContainer}>
          {quizQuestions.map((item, index) => {
            if (index < currentQuizIndex) return null;

            if (index === currentQuizIndex) {
              return (
                <Animated.View {...panResponder.panHandlers} key={item.id} style={[styles.card, rotateAndTranslate]}>
                  <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
                  <Animated.View style={[styles.overlay, styles.likeOverlay, { opacity: likeOpacity }]}><Text style={[styles.overlayText, { color: '#4CAF50' }]}>LIKE</Text></Animated.View>
                  <Animated.View style={[styles.overlay, styles.nopeOverlay, { opacity: nopeOpacity }]}><Text style={[styles.overlayText, { color: '#F44336' }]}>NOPE</Text></Animated.View>
                </Animated.View>
              );
            }
            return (
              <Animated.View key={item.id} style={[styles.card, { transform: [{ scale: nextCardScale }] }]}>
                <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
              </Animated.View>
            );
          }).reverse()}
        </View>
        <View style={styles.progressContainer}>
            <View style={[styles.progressBar, {width: `${((currentQuizIndex + 1) / quizQuestions.length) * 100}%`}]} />
        </View>
      </View>
    );
  };

  const renderResultsScreen = () => (
    <ScrollView>
        <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>Your Style Board</Text>
            <TouchableOpacity onPress={handleSignOut}><Text style={styles.signOutText}>Sign Out</Text></TouchableOpacity>
        </View>
        <Text style={styles.resultsSubtitle}>Based on your preferences, here are some looks we think you'll love.</Text>
        
        <View style={styles.recommendationsContainer}>
            {recommendations.map((item) => (
                <View key={item.id} style={styles.recommendationCard}>
                    <Image source={{ uri: item.imageUrl }} style={styles.recommendationImage} />
                    <View style={styles.recommendationTextContainer}>
                        <Text style={styles.recommendationReason}>{item.reason}</Text>
                    </View>
                </View>
            ))}
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={restartQuiz}>
            <Text style={styles.primaryButtonText}>Retake Quiz</Text>
        </TouchableOpacity>
    </ScrollView>
  );

  const renderContent = () => {
      if(appState === 'loading' || (user && fullInventory.length === 0)) return renderLoadingScreen();
      if(appState === 'auth') return renderAuthScreen();
      if(appState === 'quiz') return renderQuizScreen();
      if(appState === 'results') return renderResultsScreen();
      return renderLoadingScreen();
  };

  return (
    <LinearGradient colors={['#F7F7F7', '#E9E9E9']} style={styles.container}>
      <SafeAreaView style={{flex: 1}}>
        <StatusBar barStyle="dark-content" />
        {renderContent()}
      </SafeAreaView>
    </LinearGradient>
  );
}

// --- Stylesheet ---
const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 15, fontSize: 16, color: '#666' },
  authContainer: { flex: 1, justifyContent: 'center', padding: 30 },
  authTitle: { fontSize: 48, fontWeight: '700', textAlign: 'center', marginBottom: 10, color: '#333' },
  authSubtitle: { fontSize: 18, color: '#666', textAlign: 'center', marginBottom: 40, },
  input: { backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 20, paddingVertical: 15, borderRadius: 15, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: '#ddd' },
  authButton: { backgroundColor: '#333', padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5, },
  authButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  toggleAuthText: { color: '#333', textAlign: 'center', marginTop: 20, fontWeight: '500' },
  quizHeader: { paddingHorizontal: 20, alignItems: 'center' },
  quizHeaderText: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  quizHeaderSubText: { fontSize: 16, color: '#666', marginTop: 4 },
  quizContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', width: SCREEN_WIDTH * 0.85, height: SCREEN_HEIGHT * 0.6, borderRadius: 25, borderWidth: 1, borderColor: '#EFEFEF', backgroundColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10, },
  cardImage: { width: '100%', height: '100%', borderRadius: 24 },
  overlay: { position: 'absolute', top: 40, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 15, borderWidth: 4, backgroundColor: 'rgba(255,255,255,0.9)' },
  overlayText: { fontSize: 32, fontWeight: 'bold' },
  likeOverlay: { left: 25, borderColor: '#4CAF50', transform: [{ rotate: '-20deg' }] },
  nopeOverlay: { right: 25, borderColor: '#F44336', transform: [{ rotate: '20deg' }] },
  progressContainer: { height: 10, backgroundColor: '#E0E0E0', marginHorizontal: 30, borderRadius: 5, marginBottom: 20, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#333', borderRadius: 5 },
  resultsContainer: { flex: 1, },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, },
  resultsTitle: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  signOutText: { color: '#333', fontWeight: '600' },
  resultsSubtitle: { fontSize: 16, color: '#666', textAlign: 'center', paddingHorizontal: 20, marginBottom: 20 },
  recommendationsContainer: { paddingHorizontal: 10, },
  recommendationCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  recommendationImage: {
    width: '100%',
    height: 400,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  recommendationTextContainer: {
    padding: 15,
  },
  recommendationReason: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  primaryButton: { backgroundColor: '#333', padding: 18, borderRadius: 15, alignItems: 'center', margin: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5, },
  primaryButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});