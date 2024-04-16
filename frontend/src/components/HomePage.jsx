import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import AudioPlayer from "./AudioPlayer";
import Header from "./Header";
import "../css/library.css";

function HomePage({}) {
  const [url, setUrl] = useState("");
  const [audio, setAudio] = useState("");
  const [audioLibrary, setAudioLibrary] = useState([]);
  const [audioMessage, setAudioMessage] = useState("");
  const [audioVisibleInPlayer, setAudioVisibleInPlayer] = useState(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const navigate = useNavigate();

  //Fetch the user's audio library when the component mounts
  useEffect(() => {
    async function fetchAudioLibrary() {
      try {
        const response = await axios.get("/get-audio-library");
        setAudioLibrary(response.data.audio_library_data);
      } catch (error) {
        console.error(error);
      }
    }
    fetchAudioLibrary();
  }, []);

  useEffect(() => {
    console.log(audioLibrary);
  }, [audioLibrary]);

  const handleSubmit = async (e) => {
    e.preventDefault(); 

    if (url.trim() === "") {
      setAudioMessage("Please enter a valid URL.");
      setTimeout(() => setAudioMessage(""), 5000);
      return;
    }
    try {
      const response = await axios.post("/search-view/", {
        url,
      });
      setAudio(`/${response.data.audio_url}`);
      if (audio) {
        setAudioMessage("");
      } else {
        setAudioMessage("Failed to generate audio.");
      }
    } catch (error) {
      console.error(error);
      setAudio("Error occurred while sending the URL.");
      setAudioMessage("Error ocurred");
    }
  };


  return (
    <div>
      <Header onHomePage={true}/>
      <div className="home-container">
        <div className="top-center-container">
          <div className="home-title"> Start Listening Now </div>
          <form onSubmit={handleSubmit}>
            <input
              className="url-input"
              type="text"
              placeholder="Add link to a blogpost."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </form>
          {!audio && (
            <div>
              <button onClick={handleSubmit} className="global-button">
                Generate Audio
              </button>
            </div>
          )}
          {audioMessage && <div>{audioMessage}</div>}
        </div>

        <div className="library-container" >
          <div className="library-title">Your Library </div>
          <div className="table-container">
            <div className="table-head">
              <div
                className="column-name"
                style={{ width: "100px", paddingLeft: "15px" }}
              >
                #
              </div>
              <div className="column-name" style={{ width: "700px" }}>
                Title{" "}
              </div>
              <div className="column-name" style={{ paddingRight: "100px" }} > Duration</div>
            </div>


            <div className="horizontal-line"></div>
          </div>
          <div className="library-items">
            {audioLibrary.length > 0 ? (
              audioLibrary.map((audio, index) => (
                <LibraryItem
                  key={audio.url}
                  index={index}
                  title={audio.title}
                  url={audio.url}
                  isPlaying={audio === audioVisibleInPlayer && isAudioPlaying}
                  onClick={() => {
                    if (audio === audioVisibleInPlayer && isAudioPlaying) {
                      setIsAudioPlaying(false); //pause
            
                    } else {
                      setAudioVisibleInPlayer(audio); //play
                      setIsAudioPlaying(true);
                    }
                  }}
                />
              ))
            ) : (
              <div>No audio files in the library yet.</div>
            )}
          </div>
        </div>
        {audioVisibleInPlayer && (
          <AudioPlayer
            audio={audioVisibleInPlayer}
            isAudioPlaying={isAudioPlaying}
            setIsAudioPlaying={setIsAudioPlaying}
          />
        )}
      </div>
    </div>
  );
}

// Displays single playable audio item, allows playing/pausing, calculates duration from audio,
// handles respective UI 
function LibraryItem({ index, title, url, onClick, isPlaying }) {
  
  const audioRef = useRef(null);
  const [totalDuration, setTotalDuration] = useState("00:00");
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [showDeleteIcon, setShowDeleteIcon] = useState(false);

  const handleIndexHover = (index) => {
    setHoveredIndex(index);
    setShowDeleteIcon(true);
  };

  const handleIndexMouseLeave = () => {
    setHoveredIndex(null);
    setShowDeleteIcon(false);
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.addEventListener("loadedmetadata", () => {
        const durationInSeconds = audioRef.current.duration;
        setTotalDuration(formatTime(durationInSeconds));
      });
    }
  }, []);

  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
    return `${formattedMinutes}:${formattedSeconds}`;
  };

  return (
    <div
      className="library-item"
      onClick={onClick}
      onMouseEnter={() => handleIndexHover(index)}
      onMouseLeave={handleIndexMouseLeave}
    >
      <div key={index} className="lib-item">
        <div className="lib-item-index">

          {hoveredIndex === index ? (
            isPlaying ? (
              <div className="pause-no-background"></div>
            ) : (
              <div className="play-no-background"></div>
            )
          ) : (
            <div className="lib-index">{index + 1}.</div>
          )}
        </div>
      </div>

      <div
        className="audio-title"
        style={{ width: "700px", fontWeight: "600" }}
      >
        {title}
      </div>
      <div style={{ fontWeight: "300", fontSize: "8", paddingRight: "90px" }}>{totalDuration}</div>
      {showDeleteIcon && (
            <div className="delete-icon" onClick={() => console.log("handleDelete(index)")}>
              <div className="delete-button"></div>
            </div>
          )}
      <div style={{ display: "none" }}>
        <audio ref={audioRef} src={url} />
      </div>
    </div>
  );
}

export default HomePage;
