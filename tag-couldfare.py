import os
import json
import time
import requests
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# --- CONFIGURATION ---
load_dotenv()

# 1. CONFIGURE YOUR API KEYS in a .env file
#    This script reads your keys from the '.env' file you just saved.

# 2. CONFIGURE YOUR FIREBASE CREDENTIALS
CREDENTIALS_PATH = 'serviceAccountKey.json'

# 3. SET YOUR INVENTORY GOAL
IMAGE_LIMIT = 500
PEXELS_QUERY = "female fashion model"

# --- SETUP ---
try:
    cred = credentials.Certificate(CREDENTIALS_PATH)
    # Check if the app is already initialized to prevent crashing on re-runs
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("[SUCCESS] Firebase initialized successfully.")

    CLOUDFLARE_ACCOUNT_ID = os.getenv('CLOUDFLARE_ACCOUNT_ID')
    CLOUDFLARE_API_TOKEN = os.getenv('CLOUDFLARE_API_TOKEN')
    if not all([CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN]):
        raise ValueError("Cloudflare credentials not found in .env file.")
    print("[SUCCESS] Cloudflare AI configured.")

except Exception as e:
    print(f"[ERROR] An error occurred during setup: {e}")
    exit()

def get_images_from_pexels_api(query, limit):
    """Fetches image URLs from the Pexels API, handling pagination."""
    PEXELS_API_KEY = os.getenv('PEXELS_API_KEY')
    if not PEXELS_API_KEY:
        raise ValueError("Pexels API Key not found.")
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
            if not data['photos']: break
            for photo in data['photos']:
                image_urls.add((photo['id'], photo['src']['large']))
            print(f"[API] Found {len(image_urls)} unique images so far...")
            page += 1
            if not data.get('next_page'): break
            time.sleep(1)
        except requests.exceptions.RequestException as e:
            print(f"[ERROR] Error fetching from Pexels API: {e}")
            return []
    return list(image_urls)[:limit]

def run_cloudflare_ai(model, inputs):
    """Generic function to run a Cloudflare AI model."""
    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{model}"
    headers = {"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"}
    response = requests.post(url, headers=headers, json=inputs)
    return response.json()

def analyze_image_with_ai(image_url):
    """Uses a 2-step Cloudflare AI process to get structured tags."""
    try:
        # Step 1: Get a text description from the image
        image_response_bytes = requests.get(image_url).content
        vision_inputs = { "image": list(image_response_bytes) }
        vision_result = run_cloudflare_ai("@cf/llava-1.5-7b-hf", vision_inputs)
        
        if not vision_result.get('success'):
            raise Exception(f"Vision model failed: {vision_result.get('errors')}")

        description = vision_result['result']['description']
        print(f"[INFO] AI Vision Description: {description}")

        # Step 2: Convert the text description to structured JSON
        prompt = f"""
        Analyze the following outfit description and return ONLY a valid JSON object with keys: 'style' (e.g., 'Casual', 'Formal'), 'color', 'occasion', 'garment_type', and 'fitting'.
        Description: "{description}"
        """
        text_inputs = { "messages": [{"role": "user", "content": prompt}] }
        text_result = run_cloudflare_ai("@cf/meta/llama-2-7b-chat-int8", text_inputs)

        if not text_result.get('success'):
            raise Exception(f"Text model failed: {text_result.get('errors')}")
        
        json_response = text_result['result']['response'].strip().replace('```json', '').replace('```', '').strip()
        return json.loads(json_response)

    except Exception as e:
        print(f"[ERROR] An error occurred during AI analysis: {e}")
        return None

def main():
    image_data = get_images_from_pexels_api(PEXELS_QUERY, IMAGE_LIMIT)
    
    if not image_data:
        print("\n--- Process Finished: No images were found to process. ---")
        return

    print(f"\n--- Found {len(image_data)} images. Starting AI Tagging and Upload Process ---")
    
    new_items_added = 0

    for pexels_id, image_url in image_data:
        doc_ref = db.collection('inventory').document(str(pexels_id))
        
        if doc_ref.get().exists:
            print(f"[SKIPPING] Image {pexels_id}: already in database.")
            continue

        print(f" analyzing image: {image_url[:60]}...")
        
        tags = analyze_image_with_ai(image_url)
        
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
            time.sleep(5) # Wait a bit before trying the next one in case of a temporary issue
        
        time.sleep(1)

    print(f"\n--- Process Complete! Added {new_items_added} new items to the inventory. ---")

if __name__ == "__main__":
    main()

