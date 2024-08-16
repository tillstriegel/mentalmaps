import os
from flask import Flask, render_template, request, Response, session, jsonify
from groq import Groq
from dotenv import load_dotenv
import json
from pytrends.request import TrendReq
import re

load_dotenv()

app = Flask(__name__)
app.secret_key = os.urandom(24)

client = Groq(
    api_key=os.environ.get("GROQ_API_KEY"),
)

pytrends = TrendReq(hl='en-US', tz=360)

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

def get_search_volume(keywords):
    try:
        # Limit the number of keywords to 5 (Google Trends maximum)
        keywords = keywords[:5]
        
        # Remove any empty keywords
        keywords = [k.strip() for k in keywords if k.strip()]
        
        if not keywords:
            return {}
        
        pytrends.build_payload(keywords, timeframe='today 12-m')
        interest_over_time_df = pytrends.interest_over_time()
        
        return {keyword: int(interest_over_time_df[keyword].mean()) 
                for keyword in keywords if keyword in interest_over_time_df.columns}
    except Exception as e:
        print(f"Error fetching search volume: {e}")
        return {keyword: 0 for keyword in keywords}

def stream_groq_response(messages):
    system_prompt = {
        "role": "system",
        "content": """
        You are an industrious opportunity finder.
        You have a deep understanding of human interests and desires.
        I want you to investigate a topic and determine what people might be looking for.
        Always answer with a short informative sentence, followed by a list of 5 comma-separated, specific, long-tail follow-up keywords.
        The keywords should be in the format [[keyword1, keyword2, keyword3, ...]] with double square brackets.
        """
    }
    
    chat_completion = client.chat.completions.create(
        messages=[system_prompt] + messages,
        model="llama3-70b-8192",
        stream=True,
    )

    assistant_message = {"role": "assistant", "content": ""}
    for chunk in chat_completion:
        if chunk.choices[0].delta.content is not None:
            content = chunk.choices[0].delta.content
            assistant_message["content"] += content
            yield f"data: {content}\n\n"
    
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