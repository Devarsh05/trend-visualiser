   # Trend Visualizer

   Turns rug trends from an n8n trend agent into photorealistic room images,
   collected in an HTML gallery file that the n8n workflow generates.

   Built as an extension to the Wayfair AI Agent Engineering externship (Extern).

   ## Stack
   FastAPI · Docker · Fal.ai · n8n · Groq · Render

   ## Deployment
   Runs as a Docker web service on Render's free tier. It spins down after 15 minutes idle,
   so the first request after that takes about a minute while it cold-starts.

   ## Status
   Work in progress.