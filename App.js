/**
 * Stylist App - v2
 *
 * This React Native application provides a swipable quiz for fashion preferences,
 * saves user data to Firebase, and offers personalized recommendations.
 *
 * Features:
 * - Simple Email/Password Authentication (Sign Up & Login) with Firebase Auth.
 * - Persistent storage of liked/disliked items in Firestore.
 * - Advanced recommendation algorithm that uses both positive (likes) and
 * negative (dislikes) feedback, along with weighted tags.
 * - Clean, multi-screen interface managed by application state.
 * - Mock data simulating a large inventory (inspired by DeepFashion).
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

// --- Firebase Initialization ---
// To use this app, you MUST set up a Firebase project and paste your config here.
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project.
// 3. Add a "Web" app (even for React Native).
// 4. Copy the firebaseConfig object and paste it below.
// 5. In Firebase console -> Authentication -> Sign-in method -> Enable "Email/Password".
// 6. In Firebase console -> Firestore Database -> Create database -> Start in "production mode".
//    Then, go to "Rules" and paste the rules provided in the comments at the bottom of this file.

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
    getFirestore,
    doc,
    setDoc,
    getDoc
} from 'firebase/firestore';


const firebaseConfig = {
  apiKey: "AIzaSyDxNf21lx04ZoFTciMXRXVqkTkV5G9YfLg",
  authDomain: "thuli-web-scrape.firebaseapp.com",
  projectId: "thuli-web-scrape",
  storageBucket: "thuli-web-scrape.firebasestorage.app",
  messagingSenderId: "263219111847",
  appId: "1:263219111847:web:bbdbaea521c6b9eaf9b882"
};



// Initialize Firebase
const FIREBASE_APP = initializeApp(firebaseConfig);
const FIREBASE_AUTH = getAuth(FIREBASE_APP);
const FIREBASE_DB = getFirestore(FIREBASE_APP);


// --- Constants & Mock Data ---
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SWIPE_THRESHOLD = 0.25 * SCREEN_WIDTH;

/**
 * Generates a rich mock inventory. In a real app, this would come from a database
 * like DeepFashion.
 */
const generateMockInventory = (count) => {
  const styles = ['Casual', 'Formal', 'Bohemian', 'Streetwear', 'Vintage', 'Minimalist'];
  const colors = ['Red', 'Blue', 'Black', 'White', 'Green', 'Patterned', 'Neutral'];
  const fittings = ['Slim Fit', 'Regular', 'Loose', 'Oversized', 'Tailored'];
  const occasions = ['Everyday', 'Work', 'Party', 'Wedding', 'Vacation', 'Formal Event'];
  const materials = ['Cotton', 'Denim', 'Silk', 'Leather', 'Wool'];

  const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

  return Array.from({ length: count }, (_, i) => ({
    id: `item_${i}`,
    imageUrl: `https://picsum.photos/id/${100 + i}/700/1000`,
    tags: {
      style: getRandomItem(styles),
      color: getRandomItem(colors),
      fitting: getRandomItem(fittings),
      occasion: getRandomItem(occasions),
      material: getRandomItem(materials),
    },
  }));
};

const QUIZ_QUESTIONS = generateMockInventory(20);
const FULL_INVENTORY = generateMockInventory(1000);


// --- Advanced Recommendation Logic ---
const recommendOutfits = (likedItems, dislikedItems, inventory) => {
  if (likedItems.length === 0) {
    return inventory.slice(0, 10).map(item => ({
        ...item,
        reason: 'Here are some popular styles to start!'
    }));
  }

  // Define weights for tag importance
  const TAG_WEIGHTS = {
    style: 5,
    occasion: 4,
    fitting: 3,
    material: 2,
    color: 1,
  };

  // Create profiles of liked and disliked tags
  const likedTags = {};
  const dislikedTags = {};

  likedItems.forEach(item => {
    Object.keys(item.tags).forEach(key => {
      const value = item.tags[key];
      if (!likedTags[key]) likedTags[key] = {};
      likedTags[key][value] = (likedTags[key][value] || 0) + 1;
    });
  });

  dislikedItems.forEach(item => {
    Object.keys(item.tags).forEach(key => {
      const value = item.tags[key];
      if (!dislikedTags[key]) dislikedTags[key] = {};
      dislikedTags[key][value] = (dislikedTags[key][value] || 0) + 1;
    });
  });

  const scoredInventory = inventory.map(item => {
    let score = 0;
    const matchedTags = [];

    Object.keys(item.tags).forEach(key => {
      const value = item.tags[key];
      const weight = TAG_WEIGHTS[key] || 1;

      // Add points for matching liked tags
      if (likedTags[key] && likedTags[key][value]) {
        score += likedTags[key][value] * weight;
        matchedTags.push(value);
      }

      // Subtract points for matching disliked tags (this is crucial)
      if (dislikedTags[key] && dislikedTags[key][value]) {
        score -= dislikedTags[key][value] * weight;
      }
    });

    // Generate a reason for the recommendation
    let reason = "We think you'll like this style.";
    if (matchedTags.length > 0) {
      const uniqueMatches = [...new Set(matchedTags)];
      if (uniqueMatches.length > 2) {
        reason = `Based on your love for ${uniqueMatches[0]} and ${uniqueMatches[1]} styles.`;
      } else {
        reason = `Because you like ${uniqueMatches.join(' & ')} items.`;
      }
    }

    // Avoid recommending items the user has already seen in the quiz
    const isSeen = likedItems.some(i => i.id === item.id) || dislikedItems.some(i => i.id === item.id);
    if(isSeen) score = -Infinity;


    return { ...item, score, reason };
  });

  return scoredInventory
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};


// --- Main App Component ---
export default function App() {
  // App State
  const [appState, setAppState] = useState('loading'); // loading, auth, quiz, results
  const [user, setUser] = useState(null);

  // Auth Screen State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  // Quiz State
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [likedItems, setLikedItems] = useState([]);
  const [dislikedItems, setDislikedItems] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  // Animation Refs
  const position = useRef(new Animated.ValueXY()).current;
  
  // --- Authentication Logic ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(FIREBASE_AUTH, async (user) => {
      if (user) {
        setUser(user);
        await loadUserPreferences(user.uid);
        setAppState('quiz');
      } else {
        setUser(null);
        setAppState('auth');
      }
    });
    return unsubscribe; // Cleanup subscription
  }, []);

  const handleAuth = async () => {
      if (!email || !password) {
          Alert.alert("Error", "Please enter both email and password.");
          return;
      }
      setAuthLoading(true);
      try {
          if (isLogin) {
              await signInWithEmailAndPassword(FIREBASE_AUTH, email, password);
          } else {
              await createUserWithEmailAndPassword(FIREBASE_AUTH, email, password);
              // We can initialize user preferences here if needed
          }
      } catch (error) {
          Alert.alert("Authentication Failed", error.message);
      } finally {
          setAuthLoading(false);
      }
  };

  const handleSignOut = () => {
      signOut(FIREBASE_AUTH);
      // Reset all state for the new user
      setCurrentQuizIndex(0);
      setLikedItems([]);
      setDislikedItems([]);
      setRecommendations([]);
      setEmail('');
      setPassword('');
  };

  // --- Firestore Logic ---
  const saveUserPreferences = async (uid, likes, dislikes) => {
      if (!uid) return;
      try {
          const userDocRef = doc(FIREBASE_DB, "userPreferences", uid);
          await setDoc(userDocRef, {
              likedItems: likes.map(item => item.id),
              dislikedItems: dislikes.map(item => item.id)
          });
      } catch (error) {
          console.error("Error saving preferences: ", error);
      }
  };

  const loadUserPreferences = async (uid) => {
      if (!uid) return;
      const userDocRef = doc(FIREBASE_DB, "userPreferences", uid);
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
          const prefs = docSnap.data();
          // Map IDs back to full item objects
          const findItemById = (id) => QUIZ_QUESTIONS.find(item => item.id === id) || FULL_INVENTORY.find(item => item.id === id);
          
          const loadedLikes = prefs.likedItems.map(findItemById).filter(Boolean);
          const loadedDislikes = prefs.dislikedItems.map(findItemById).filter(Boolean);

          setLikedItems(loadedLikes);
          setDislikedItems(loadedDislikes);
      }
  };


  // --- PanResponder for Swiping ---
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gestureState) => {
          position.setValue({ x: gestureState.dx, y: 0 });
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx > SWIPE_THRESHOLD) {
            forceSwipe('right');
          } else if (gestureState.dx < -SWIPE_THRESHOLD) {
            forceSwipe('left');
          } else {
            resetPosition();
          }
        },
      }),
    [currentQuizIndex, likedItems, dislikedItems] // Re-create when state changes
  );

  const forceSwipe = (direction) => {
    const x = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => onSwipeComplete(direction));
  };

  const onSwipeComplete = async (direction) => {
    const item = QUIZ_QUESTIONS[currentQuizIndex];
    let updatedLikes = [...likedItems];
    let updatedDislikes = [...dislikedItems];

    if (direction === 'right') {
      updatedLikes.push(item);
      setLikedItems(updatedLikes);
    } else {
      updatedDislikes.push(item);
      setDislikedItems(updatedDislikes);
    }
    
    // Save to Firestore after each swipe
    if (user) {
        await saveUserPreferences(user.uid, updatedLikes, updatedDislikes);
    }

    position.setValue({ x: 0, y: 0 });
    
    if (currentQuizIndex + 1 >= QUIZ_QUESTIONS.length) {
        const recommended = recommendOutfits(updatedLikes, updatedDislikes, FULL_INVENTORY);
        setRecommendations(recommended);
        setAppState('results');
    } else {
        setCurrentQuizIndex(prev => prev + 1);
    }
  };
  
  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      friction: 4,
      useNativeDriver: false,
    }).start();
  };

  const restartQuiz = () => {
      setCurrentQuizIndex(0);
      setAppState('quiz');
  };

  // --- Dynamic styles for card animation ---
  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });
  const rotateAndTranslate = { transform: [{ rotate }, ...position.getTranslateTransform()] };
  const likeOpacity = position.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD / 2], outputRange: [0, 1] });
  const nopeOpacity = position.x.interpolate({ inputRange: [-SWIPE_THRESHOLD / 2, 0], outputRange: [1, 0] });


  // --- RENDER FUNCTIONS FOR EACH APP STATE ---

  const renderLoadingScreen = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>Loading Your Style</Text>
    </View>
  );

  const renderAuthScreen = () => (
    <View style={styles.authContainer}>
        <Text style={styles.authTitle}>Style Finder</Text>
        <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
        />
        <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
        />
        <TouchableOpacity style={styles.authButton} onPress={handleAuth} disabled={authLoading}>
            {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.authButtonText}>{isLogin ? 'Login' : 'Sign Up'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
            <Text style={styles.toggleAuthText}>
                {isLogin ? 'Need an account? Sign Up' : 'Have an account? Login'}
            </Text>
        </TouchableOpacity>
    </View>
  );

  const renderQuizScreen = () => {
    return (
      <View style={{flex: 1}}>
        <View style={styles.quizHeader}>
            <Text style={styles.quizHeaderText}>Discover Your Style</Text>
            <Text style={styles.quizHeaderSubText}>Swipe right if you like it, left if you don't</Text>
        </View>
        <View style={styles.quizContainer}>
          {QUIZ_QUESTIONS.map((item, index) => {
            if (index < currentQuizIndex) return null;
            if (index === currentQuizIndex) {
              return (
                <Animated.View {...panResponder.panHandlers} key={item.id} style={[styles.card, rotateAndTranslate]}>
                  <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
                  <Animated.View style={[styles.overlay, styles.likeOverlay, { opacity: likeOpacity }]}><Text style={styles.overlayText}>LIKE</Text></Animated.View>
                  <Animated.View style={[styles.overlay, styles.nopeOverlay, { opacity: nopeOpacity }]}><Text style={styles.overlayText}>NOPE</Text></Animated.View>
                </Animated.View>
              );
            }
            return (
              <Animated.View key={item.id} style={[styles.card, { top: 10 * (index - currentQuizIndex), zIndex: -index }]}>
                <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
              </Animated.View>
            );
          }).reverse()}
        </View>
        <Text style={styles.progressText}>
            {Math.min(currentQuizIndex + 1, QUIZ_QUESTIONS.length)} / {QUIZ_QUESTIONS.length}
        </Text>
      </View>
    );
  };

  const renderResultsScreen = () => (
    <ScrollView>
        <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>Your Style Recommendations ✨</Text>
            <TouchableOpacity onPress={handleSignOut}><Text style={styles.signOutText}>Sign Out</Text></TouchableOpacity>
        </View>
        {recommendations.map(item => (
            <View key={item.id} style={styles.recommendationCard}>
                <Image source={{ uri: item.imageUrl }} style={styles.recommendationImage} />
                <View style={styles.recommendationTextContainer}>
                    <Text style={styles.recommendationReason}>{item.reason}</Text>
                    <Text style={styles.recommendationTags}>{`Style: ${item.tags.style} | Occasion: ${item.tags.occasion}`}</Text>
                </View>
            </View>
        ))}
        <TouchableOpacity style={styles.primaryButton} onPress={restartQuiz}>
            <Text style={styles.primaryButtonText}>Retake Style Quiz</Text>
        </TouchableOpacity>
    </ScrollView>
  );

  const renderContent = () => {
      switch(appState) {
          case 'loading': return renderLoadingScreen();
          case 'auth': return renderAuthScreen();
          case 'quiz': return renderQuizScreen();
          case 'results': return renderResultsScreen();
          default: return renderLoadingScreen();
      }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {renderContent()}
    </SafeAreaView>
  );
}

// --- Stylesheet ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F7' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#666' },

  // Auth Screen
  authContainer: { flex: 1, justifyContent: 'center', padding: 20 },
  authTitle: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, color: '#333' },
  input: {
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  authButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  authButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  toggleAuthText: { color: '#007AFF', textAlign: 'center', marginTop: 20 },

  // Quiz Screen
  quizHeader: { padding: 20, alignItems: 'center' },
  quizHeaderText: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  quizHeaderSubText: { fontSize: 16, color: '#666', marginTop: 4 },
  quizContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -60 },
  card: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_HEIGHT * 0.65,
    borderRadius: 20,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  cardImage: { width: '100%', height: '100%', borderRadius: 20 },
  progressText: { textAlign: 'center', fontSize: 18, fontWeight: 'bold', color: '#555', paddingBottom: 20, },
  overlay: { position: 'absolute', top: 50, padding: 10, borderRadius: 15, borderWidth: 5 },
  overlayText: { fontSize: 40, fontWeight: 'bold', color: 'white' },
  likeOverlay: { left: 20, borderColor: '#4CAF50', transform: [{ rotate: '-30deg' }] },
  nopeOverlay: { right: 20, borderColor: '#F44336', transform: [{ rotate: '30deg' }] },

  // Results Screen
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, },
  resultsTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  signOutText: { color: '#007AFF', fontWeight: '600' },
  recommendationCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    marginBottom: 20,
    marginHorizontal: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 5,
  },
  recommendationImage: { width: '100%', height: 350, borderTopLeftRadius: 15, borderTopRightRadius: 15 },
  recommendationTextContainer: { padding: 15 },
  recommendationReason: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 5 },
  recommendationTags: { fontSize: 14, color: '#777' },
  primaryButton: {
      backgroundColor: '#007AFF',
      padding: 15,
      borderRadius: 30,
      alignItems: 'center',
      margin: 20,
  },
  primaryButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});


/*
--- FIRESTORE SECURITY RULES ---
To secure your database, go to your Firebase project -> Firestore Database -> Rules
and paste the following rules. This ensures that a user can only read/write their
own preference data.

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only allow users to read and write their own preferences document
    match /userPreferences/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}

*/

