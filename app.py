import os
from flask import Flask, render_template, request, Response, session, jsonify
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.urandom(24)

client = Groq(
    api_key=os.environ.get("GROQ_API_KEY"),
)

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

def stream_groq_response(messages):
    system_prompt = {
        "role": "system",
        "content": """
        Always answer with a short informative sentence, followed by a list of comma-separated, specific, long-tail follow-up keywords.
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
    
    yield "data: [END]\n\n"

    messages.append(assistant_message)

if __name__ == '__main__':
    app.run(debug=True)