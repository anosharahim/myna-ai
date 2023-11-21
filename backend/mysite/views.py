from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import serializers
import trafilatura
from trafilatura.settings import use_config
import torch
from TTS.api import TTS
from uuid import uuid4
from .models import GlobalAudioLibrary, UserAudios
from django.contrib.auth.models import User
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
import speech_recognition as sr
from config import OPENAI_GPT4_KEY
import openai
import requests
from bs4 import BeautifulSoup

newconfig = use_config()
newconfig.set("DEFAULT", "EXTRACTION_TIMEOUT", "0")


class DisableCSRFMiddleware(object):
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        setattr(request, '_dont_enforce_csrf_checks', True)
        response = self.get_response(request)
        return response


class TextSearchView(APIView):
    '''Recieves blog urls from frontend to generate audios and saves thems in DB.'''

    def post(self, request):
        if 'url' not in request.data:
            return Response({'error': 'missing url in request data'}, status=400)
        url = request.data.get('url', '')
        if not GlobalAudioLibrary.objects.filter(website_url=url).exists():
            html_content = trafilatura.fetch_url(url)
            extracted_text = trafilatura.extract(
                html_content, output_format="text", config=newconfig)

            # Get the title of the article
            soup = BeautifulSoup(html_content, 'html.parser')
            title_tag = soup.find('title')
            content_title = title_tag.text if title_tag else "Title not found"

            audio_url = text_to_audio(
                request, extracted_text[:1024], url, content_title)

        else:
            audio_url = GlobalAudioLibrary.objects.get(
                website_url=url).audio_id
            audio_url = "static/" + audio_url + ".wav"

        # create and save embedding to model
        audio_instance = GlobalAudioLibrary.objects.get(website_url=url)
        if not audio_instance.embedding:
            audio_embedding = create_embedding(extracted_text)
            audio_instance.embedding = audio_embedding
            audio_instance.save()

        return Response({'audio_url': audio_url}, status=200)


class AudioLibraryView(APIView):
    '''Sends user's audio library data to client.'''

    def get(self, request):
        user = request.user
        user_audios = GlobalAudioLibrary.objects.filter(
            user=user).values('title', 'audio_id')
        audio_library_data = [{'title': audio['title'],
                               'url': f"static/{audio['audio_id']}.wav"} for audio in user_audios]
        return Response({'audio_library_data': audio_library_data}, status=200)


class MessageView(APIView):
    '''Receives speech-based user input queries from the client.'''

    def post(self, request):
        if 'query' in request.data:
            query = request.data.get('query', '')
            prompt = self.generatePrompt(query)
            response = openai.ChatCompletion.create(
                model='gpt-4',
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0.3,
                api_key=OPENAI_GPT4_KEY,
            )
            result = response.choices[0].message.content
            # TODO: convert result into audio to be played by the frontend.
            return Response({'result': result}, status=200)

        else:
            return Response({'error': "No user input detected"})

    def generatePrompt(self, user_query):
        '''Generates LLM prompt from user query.'''
        # TODO: engineer the prompt for better output
        prompt = user_query + "be concise."
        return prompt


def create_embedding(text):
    '''Generates embeddings for audio text.'''
    openai.api_key = OPENAI_GPT4_KEY
    openai_response = openai.Embedding.create(
        input=text,
        model="text-embedding-ada-002"
    )
    embeddings = openai_response['data'][0]['embedding']
    return embeddings


def text_to_audio(request, content, url, title):
    '''Converts extracted content into an audio file, and saves it to DB.'''

    user = request.user
    if not request.user.id:
        return Response({'error': "No user"}, status=403)
    if not GlobalAudioLibrary.objects.filter(user=user, website_url=url).exists():

        device = "cuda" if torch.cuda.is_available() else "cpu"

        model_name = TTS().list_models()[0]
        tts = TTS(model_name).to(device)

        file_id = uuid4()
        GlobalAudioLibrary.objects.create(
            user=user, title=title, website_url=url, audio_id=file_id)

        file_path = f"/Users/anosharahim/storyteller-ai/backend/uploads/{file_id}.wav"
        tts.tts_to_file(
            text=content, speaker=tts.speakers[0], language=tts.languages[0], file_path=file_path)

    return "static/" + GlobalAudioLibrary.objects.get(website_url=url, user=user).audio_id + ".wav"


def sign_up(request):
    '''Creates a new account for the user.'''
    if request.method == 'POST':
        data = json.loads(request.body)
        username = data.get('name')
        password = data.get('password')

        if not User.objects.filter(username=username).exists():
            User.objects.create_user(username=username, password=password)
            return JsonResponse({'success': True})
        else:
            return JsonResponse({'success': False})

    return JsonResponse({'error': 'Invalid request method'}, status=405)


def check_is_authenticated(request):
    '''Checks if user is authenticated.'''
    if request.user and request.user.id:
        return JsonResponse({"the message": "success"}, status=200)
    else:
        return JsonResponse({"error": "not logged in"}, status=403)


def login_handler(request):
    '''Logs users into their account.'''
    if request.method == 'POST':
        data = json.loads(request.body)
        username = data.get('name')
        password = data.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return JsonResponse({'success': True}, status=200)
        else:
            return JsonResponse({'success': False}, status=403)
    return JsonResponse({'error': 'Invalid request method'}, status=405)


def logout_handler(request):
    '''Logs out user.'''
    logout(request)
    return JsonResponse({'success': True}, status=200)
