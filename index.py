from flask import Flask, request, jsonify

app = Flask(__name__)

# Example endpoint – you can add more
@app.route('/api/add', methods=['POST'])
def add_item():
    data = request.json
    return jsonify({"message": f"Item received: {data.get('item')}"})


# Vercel Serverless Handler
def handler(event, context):
    return app(event, context)
