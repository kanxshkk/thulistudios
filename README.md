
# **StyleMe: AI-Powered Stylist App**  
**Thuli Studios – SDE Exercise**

A complete solution for the Style Quiz App problem statement, featuring a backend data pipeline to build a fashion inventory and a React Native mobile app that provides personalized style recommendations.

---

## 📖 **Overview**

StyleMe is designed to provide users with an engaging style quiz experience and personalized fashion recommendations. The solution focuses on delivering depth, reliability, and scalability by integrating modern AI tools and cloud services. The system is divided into two parts: an automated fashion inventory builder and an interactive mobile application.

---

## ✅ **Problem-Solving and Decision-Making Approach**

### Core Decisions & Their Justifications:

- **Data Source: Pexels API vs. Scraping**
  - ✅ **Chosen**: Pexels API  
  - **Why**: API usage is more stable, ethical, and production-ready compared to scraping which risks layout changes and IP bans.

- **Feature Extraction: AI Models vs. Manual Tagging**
  - ✅ **Chosen**: Cloudflare AI / Google Gemini  
  - **Why**: Automated tagging is scalable and cost-effective, avoiding manual tagging for thousands of items.

- **Database: Firebase Firestore**
  - ✅ **Chosen**: Firestore  
  - **Why**: Offers real-time updates, scalability, generous free tier, and seamless integration with React Native.

- **Recommendation Model: Content-Based Filtering**
  - ✅ **Chosen**: Weighted content-based filtering  
  - **Why**: Provides explainable, immediate recommendations for every new user without cold start issues.

---

## 🏗 **System Design**

### ✅ **Backend Data Pipeline**
A Python script (`inventory_builder.py`) automates fashion inventory creation.

1. **Data Acquisition**  
   Fetches fashion images using the Pexels API.

2. **AI-Powered Tagging**  
   Uses Cloudflare AI to extract features such as style, color, and occasion.

3. **Data Storage**  
   Uploads image URLs and tags to Firebase Firestore with duplicate-checking for data integrity.

---

### ✅ **Mobile App (React Native)**

1. **Authentication & Storage**  
   Firebase Auth handles user login/signup, while AsyncStorage keeps users signed in.

2. **Interactive Style Quiz**  
   Users swipe on fashion items pulled from Firestore in a Tinder-style interface.

3. **Recommendations**  
   A content-based filtering algorithm matches user preferences to inventory items.

4. **Explainable Results**  
   The app presents top recommendations along with personalized explanations.

---

## 📷 **Demo Screenshots**

- *Quiz Interface*  
  *(Placeholder for image)*

- *Recommendation Board*  
  *(Placeholder for image)*

---

## 🚀 **Getting Started**

### **Run the Data Pipeline**

1. Install dependencies:  

2. Add credentials:  
   Create a `.env` file and add your Pexels API key, Cloudflare API key, and Firebase `serviceAccountKey.json`.

3. Run the script:  
   ```bash
   python scraper.py
   ```

---

### **Run the Mobile App**

1. Install dependencies:  
   ```bash
   npm install
   npx expo install firebase @react-native-async-storage/async-storage expo-linear-gradient
   ```

2. Configure Firebase:  
   Update the `firebaseConfig` object in `App.js` with your Firebase project details.

3. Update Firestore Rules:  
   Copy the rules from `App.js` comments into the Firestore “Rules” tab.

4. Launch the app:  
   ```bash
   npx start
   ```

---

## 📈 **Future Improvements**

- **Hybrid Recommendation System**  
  Introduce collaborative filtering to suggest items based on user similarities and promote style discovery.

- **Popularity-Based Fallback**  
  Add trending or most-liked recommendations for new users or to refresh results.

- **Enhanced Feature Extraction**  
  Improve AI tagging to recognize patterns, textures, and brand elements for deeper personalization.

---

## 📂 **Project Structure**

<img width="1452" height="651" alt="image" src="https://github.com/user-attachments/assets/a92f2b17-b6a6-4ced-9583-e490c968b395" />
<img width="1449" height="712" alt="image" src="https://github.com/user-attachments/assets/f2a5ee3a-78e4-482a-af43-d8895ae51c7d" />

---

