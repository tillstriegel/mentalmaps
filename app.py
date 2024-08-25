import os
from flask import Flask, render_template, request, Response, session, jsonify
from groq import Groq
from dotenv import load_dotenv
import json
from pytrends.request import TrendReq
import re
import requests
import time

load_dotenv()

app = Flask(__name__)
app.secret_key = os.urandom(24)

client = Groq(
    api_key=os.environ.get("GROQ_API_KEY"),
)

pytrends = TrendReq(hl='en-US', tz=360, timeout=(10,25), retries=2, backoff_factor=0.1)

session = {}

@app.route('/', methods=['GET', 'POST'])
def home():
    if 'messages' not in session:
        session['messages'] = []

    if request.method == 'POST':
        if 'clear' in request.form:
            session['messages'] = []
            return jsonify({"status": "cleared"})
        
        user_input = request.form['user_input']
        session['messages'].append({"role": "user", "content": user_input})

        return Response(stream_groq_response(session['messages']), content_type='text/event-stream')
    
    return render_template('index.html', messages=session['messages'])

@app.route('/autocomplete', methods=['GET'])
def autocomplete():
    query = request.args.get('q', '')
    suggestions = get_autocomplete_suggestions(query)
    return jsonify(suggestions)

@app.route('/search_volumes', methods=['POST'])
def search_volumes():
    try:
        keywords = request.json['keywords']
        volumes = get_search_volume(keywords)
        print(f"Search volumes: {volumes}")  # Log the volumes
        return jsonify(volumes)
    except Exception as e:
        print(f"Error in search_volumes route: {e}")
        return jsonify({"error": str(e)}), 500

def get_autocomplete_suggestions(query):
    url = f'https://www.google.com/complete/search?q={query}&cp={len(query)}&client=gws-wiz&xssi=t&hl=en-US'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
    }
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        # Remove the leading )]}'
        data = response.text[5:]
        suggestions = json.loads(data)[0]
        # Extract only the text suggestions
        return [item[0] for item in suggestions]
    else:
        return []

def get_search_volume(keywords):
    try:
        # Limit the number of keywords to 5 (Google Trends maximum)
        keywords = keywords[:5]
        
        # Remove any empty keywords
        keywords = [k.strip() for k in keywords if k.strip()]
        
        if not keywords:
            return {}
        
        # Add a small delay to avoid rate limiting
        time.sleep(1)
        
        pytrends.build_payload(keywords, timeframe='today 12-m', geo='US')
        interest_over_time_df = pytrends.interest_over_time()
        
        # If the dataframe is empty, return 0 for all keywords
        if interest_over_time_df.empty:
            return {keyword: 0 for keyword in keywords}
        
        # Calculate the mean interest for each keyword
        volumes = {}
        for keyword in keywords:
            if keyword in interest_over_time_df.columns:
                volumes[keyword] = int(interest_over_time_df[keyword].mean())
            else:
                volumes[keyword] = 0
        
        return volumes
    except Exception as e:
        print(f"Error fetching search volume: {e}")
        return {keyword: 0 for keyword in keywords}

def stream_groq_response(messages):
    system_prompt = {
        "role": "system",
        "content": """
        You are a top researcher.
        I want you to investigate a topic and determine what interesting fields and topics are related to it.
        Always answer with a list of 5 comma-separated, related, long-tail keywords.
        The keywords should be in the format [[keyword1, keyword2, keyword3, ...]] with double square brackets.
        Following this list, in the next line, output the name of a fitting Google Material Icon (e.g. "search", "book", "pets", "health", etc.).
        Ensure that the icon name is on a new line.

        EXAMPLE OUTPUT:
        [[keyword1, keyword2, keyword3, ...]]
        icon_name
        """
    }
    
    chat_completion = client.chat.completions.create(
        messages=[system_prompt] + messages,
        model="llama-3.1-70b-versatile",
        temperature=0.5,
        stream=True,
    )

    assistant_message = {"role": "assistant", "content": ""}
    for chunk in chat_completion:
        if chunk.choices[0].delta.content is not None:
            content = chunk.choices[0].delta.content
            assistant_message["content"] += content
            yield f"data: {content}\n\n"
    
    print("Full AI response:", repr(assistant_message["content"]))  # Use repr to show newlines
    # Extract keywords and get search volume
    keywords = re.findall(r'\[\[(.*?)\]\]', assistant_message["content"])
    if keywords:
        keywords = [k.strip() for k in keywords[0].split(',')]
        search_volumes = get_search_volume(keywords)
        yield f"data: SEARCH_VOLUMES{json.dumps(search_volumes)}\n\n"

    yield "data: [END]\n\n"

    messages.append(assistant_message)

if __name__ == '__main__':
    app.run(debug=True)