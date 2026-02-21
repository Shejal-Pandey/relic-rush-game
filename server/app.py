from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
import socket
import uuid

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

sessions = {}
socket_map = {}


def get_local_ip():
    """Get the local IP address of this machine on the network."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip


@app.route('/api/session', methods=['POST'])
def create_session():
    session_id = str(uuid.uuid4())[:8]
    ip = get_local_ip()
    sessions[session_id] = {'players': [], 'status': 'waiting'}
    return jsonify({'sessionId': session_id, 'ip': ip, 'port': 5173})


@socketio.on('join_session')
def handle_join(data):
    session_id = data.get('sessionId')
    role = data.get('role')
    join_room(session_id)
    from flask import request as freq
    socket_map[freq.sid] = {'sessionId': session_id, 'role': role}

    if role == 'controller':
        name = data.get('name', 'Player')
        emit('player_joined', {'name': name}, room=session_id)
    elif role == 'desktop':
        emit('desktop_ready', {'sessionId': session_id}, room=session_id)


@socketio.on('control')
def handle_control(data):
    session_id = data.get('sessionId')
    emit('control', {'direction': data['direction']}, room=session_id, include_self=False)


@socketio.on('start_game')
def handle_start(data):
    session_id = data.get('sessionId')
    emit('game_started', {}, room=session_id)


@socketio.on('end_game')
def handle_end(data):
    session_id = data.get('sessionId')
    score = data.get('score', 0)
    coins = data.get('coins', 0)
    emit('game_ended', {'score': score, 'coins': coins}, room=session_id)


@socketio.on('score_update')
def handle_score(data):
    session_id = data.get('sessionId')
    emit('score_update', {
        'score': data.get('score', 0),
        'coins': data.get('coins', 0)
    }, room=session_id, include_self=False)


@socketio.on('restart_game')
def handle_restart(data):
    session_id = data.get('sessionId')
    emit('restart_game', {}, room=session_id, include_self=False)


@socketio.on('disconnect')
def handle_disconnect():
    from flask import request as freq
    sid = freq.sid
    info = socket_map.pop(sid, None)
    if info and info['role'] == 'controller':
        session_id = info['sessionId']
        emit('controller_disconnected', {}, room=session_id)


if __name__ == '__main__':
    socketio.run(app, debug=True, port=5002, host='0.0.0.0', allow_unsafe_werkzeug=True)
