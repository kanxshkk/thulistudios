import os
import json
import time
import requests
from bs4 import BeautifulSoup
import google.generativeai as genai
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# --- CONFIGURATION ---
load_dotenv()

# 1. CONFIGURE YOUR API KEYS in a .env file
#    Create a file named '.env' in this directory and add:
#    GOOGLE_API_KEY="your_google_ai_key"
#    PEXELS_API_KEY="your_pexels_api_key"

# 2. CONFIGURE YOUR FIREBASE CREDENTIALS
#    Download your serviceAccountKey.json from Firebase Project Settings -> Service accounts
#    and place it in the same directory as this script.
CREDENTIALS_PATH = 'serviceAccountKey.json'

# 3. SET YOUR INVENTORY GOAL
IMAGE_LIMIT = 500 # How many total images you want in your inventory.
PEXELS_QUERY = "female fashion model"
# Re-enabling the daily limit for the 'gemini-1.5-flash' model
DAILY_AI_LIMIT = 48 # A safe number of AI calls to make per day (actual limit is ~50).

# --- SETUP ---
try:
    # Initialize Firebase Admin SDK
    cred = credentials.Certificate(CREDENTIALS_PATH)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("[SUCCESS] Firebase initialized successfully.")

    # Configure Gemini AI
    GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
    if not GOOGLE_API_KEY:
        raise ValueError("Google AI API Key not found. Please set GOOGLE_API_KEY in your .env file.")
    genai.configure(api_key=GOOGLE_API_KEY)
    # FIX: Reverted to the last known working model
    model = genai.GenerativeModel('gemini-1.5-flash')
    print("[SUCCESS] Gemini AI model configured.")

except FileNotFoundError:
    print(f"[ERROR] Firebase credentials not found at '{CREDENTIALS_PATH}'. Please download it and place it here.")
    exit()
except Exception as e:
    print(f"[ERROR] An unexpected error occurred during setup: {e}")
    exit()


def get_images_from_pexels_api(query, limit):
    """Fetches image URLs from the Pexels API, handling pagination."""
    PEXELS_API_KEY = os.getenv('PEXELS_API_KEY')
    if not PEXELS_API_KEY:
        raise ValueError("Pexels API Key not found. Please set PEXELS_API_KEY in your .env file.")

    headers = {'Authorization': PEXELS_API_KEY}
    image_urls = set()
    page = 1
    per_page = 80

    print(f"\n[API] Getting up to {limit} images from Pexels for query: '{query}'...")
    while len(image_urls) < limit:
        url = f"https://api.pexels.com/v1/search?query={query}&per_page={per_page}&page={page}"
        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            if not data['photos']:
                print("[API] No more photos found. Stopping.")
                break

            for photo in data['photos']:
                image_urls.add((photo['id'], photo['src']['large']))
            
            print(f"[API] Found {len(image_urls)} unique images so far...")

            page += 1
            if not data.get('next_page'):
                print("[API] Reached the end of Pexels results.")
                break
            
            time.sleep(1)

        except requests.exceptions.RequestException as e:
            print(f"[ERROR] Error fetching from Pexels API: {e}")
            return []
            
    return list(image_urls)[:limit]


def analyze_image_with_ai(image_url):
    """Uses Gemini AI to analyze an image and return structured tags."""
    try:
        response = model.generate_content([
            "Analyze this image of an outfit. Return a JSON object with keys: 'style' (e.g., 'Casual', 'Formal', 'Bohemian'), 'color' (dominant color or pattern), 'occasion' (e.g., 'Everyday', 'Party'), 'garment_type' (e.g., 'Dress', 'Suit'), and 'fitting' (e.g., 'Slim Fit', 'Loose').",
            {"mime_type": "image/jpeg", "data": requests.get(image_url).content}
        ])
        
        text_response = response.text.strip().replace('```json', '').replace('```', '').strip()
        return json.loads(text_response)
        
    except Exception as e:
        print(f"[ERROR] An error occurred during AI analysis: {e}")
        return None

def main():
    """Main function to run the inventory building process."""
    image_data = get_images_from_pexels_api(PEXELS_QUERY, IMAGE_LIMIT)
    
    if not image_data:
        print("\n--- Process Finished: No images were found to process. ---")
        return

    print(f"\n--- Found {len(image_data)} images. Starting AI Tagging and Upload Process ---")
    
    new_items_added = 0
    ai_calls_today = 0

    for pexels_id, image_url in image_data:
        if ai_calls_today >= DAILY_AI_LIMIT:
            print(f"\n[INFO] Reached the daily AI limit of {DAILY_AI_LIMIT}. Please run the script again tomorrow to continue.")
            break
            
        doc_ref = db.collection('inventory').document(str(pexels_id))
        
        if doc_ref.get().exists:
            print(f"[SKIPPING] Image {pexels_id}: already in database.")
            continue

        print(f" analyzing image: {image_url[:60]}...")
        
        tags = analyze_image_with_ai(image_url)
        ai_calls_today += 1
        
        if tags:
            print(f"[SUCCESS] AI analysis complete: {tags.get('style', 'N/A')}, {tags.get('color', 'N/A')}")
            
            doc_ref.set({
                'imageUrl': image_url,
                'tags': tags,
                'pexels_id': pexels_id
            })
            print(f"[SUCCESS] Successfully uploaded to Firestore with ID: {pexels_id}")
            new_items_added += 1
        else:
            print("[INFO] Halting process due to AI analysis error. Please check the logs.")
            break
        
        # Adjust sleep time for the 'gemini-1.5-flash' RPM limit (10 RPM)
        # 60 seconds / 10 requests = 6 seconds per request
        time.sleep(6)

    print(f"\n--- Process Complete! Added {new_items_added} new items to the inventory. ---")

if __name__ == "__main__":
    main()

