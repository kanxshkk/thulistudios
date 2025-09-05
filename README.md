# thulistudios
recruitment hackathon

data scraper ?? -> lets gather images and metadata from fashion e-commerce sites
Image Feature Extraction, to tag-> Vision-and-Language Model

Recommendation System:
  

  maybe a content based filtering for now,

  phase1 (ip): 
    quiz -> like/dislike say 20 images, 
    store tag associated with it in a db (Firestore or PostgreSQL)
    
  phase2 (op): 
    User Preference Model, we get Implicit Feedback from like/dislike
    Logistic Regression Model:
      Input Data: matrix -> 
        rows -> liked/disliked outfit from quiz
        columns -> features (is_red, is_casual, is_fitted)
      Output :

Scoring outfits probability score between 0 and 100 , how much the user liked it  
Recommending - top 10–20 outfits with highest  score
Explaination -> Large Language Model (LLM) or a rule-based system? 
