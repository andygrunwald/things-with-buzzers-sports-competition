/**
 * Init the clock in the header
 */
function mainClockTicker() {
    var stunden, minuten, sekunden;
    var StundenZahl, MinutenZahl, SekundenZahl;
    var heute;

    heute = new Date();
    StundenZahl = heute.getHours();
    MinutenZahl = heute.getMinutes();
    SekundenZahl = heute.getSeconds();

    stunden = StundenZahl + ":";
    if (MinutenZahl < 10) {
        minuten = "0" + MinutenZahl + ":";
    } else {
        minuten = MinutenZahl + ":";
    }

    if (SekundenZahl < 10) {
        sekunden = "0" + SekundenZahl + " ";
    } else {
        sekunden = SekundenZahl + " ";
    }
    zeit = stunden + minuten + sekunden + " Uhr";

    $("#uhr").text(zeit);
    window.setTimeout("mainClockTicker();", 1000);
}

/**
 * Converts the stopwatch time into seconds.
 *
 * @param   string str  The current stopwatch time, e.g., 00:00:08
 * @return  int         The stopwatch time converted into seconds, e.g., 8
 */
function strToTime(str) {
    var t = 0;
    split = str.split(":")

    t = parseInt(split[2]) + (parseInt(split[1]) * 60) + (parseInt(split[0]) * 60 * 60);
    return t;
}

/**
 * Converts seconds into a stopwatch time format.
 *
 * @param   int     timeleft    Seconds, e.g., 8
 * @return  string              Seconds converted into stopwatch time format, e.g., 00:00:08
 */
function timeToStr(timeleft) {
    hour = Math.floor(timeleft / 3600);
    minute = Math.floor((timeleft % 3600) / 60);
    second = Math.floor(timeleft % 60);

    str = hour + ":";
    if (hour < 10) {
        str = "0" + str;
    }

    if (minute < 10) {
        str = str + "0";
    }
    str = str + minute + ":";

    if (second < 10) {
        str = str + "0";
    }
    str = str + second;
    return str;
}

/**
 * Connects to a websocket and executes the logic
 * once a message comes in via the websocket.
 *
 * @param string websocketURL   URL of the websocket to connect to
 * @param string audioURL       URL of the audio files
 */
function connectToWebSocket(websocketURL, audioURL) {
    console.log("WebSocket: Connecting to " + websocketURL)
    ws = new WebSocket(websocketURL);

    ws.onopen = function(evt) {
        console.log("WebSocket: Connected");
    }
    ws.onerror = function(evt) {
        console.log("WebSocket: Error -> ", evt);
    }
    ws.onclose = function(){
        console.log("WebSocket: Close ... Try to reconnect");
        // Try to reconnect in 5 seconds
        setTimeout(function(){connectToWebSocket(websocketURL)}, 5000);
    }

    // When a new message from the WebSocket server comes in ...
    // Mainly if an athlete hits one of the buzzers
    ws.onmessage = function(evt) {
        // The data that was sent by the server
        message = JSON.parse(evt.data);

        buttonColor = message.Color
        heatNumber = getCurrentFinisherHeat(buttonColor)

        // If a finisher hits the buzzer multiple times,
        // it should only count one. Here we block multple calls
        // within 10 sec. (delay)
        var hit = getButtonLastHit(buttonColor)
        currentTime = Math.floor(Date.now() / 1000)
        if (hit != 0 && (currentTime - hit) < 10) {
            return;
        }
        setButtonLastHit(buttonColor, currentTime)

        // An athlethe finished the workout.
        setAthletesFinishTime(buttonColor, heatNumber);
        setAthleteAsFinished(buttonColor, heatNumber);

        // Determine the next athlete that will finish
        // the workout
        setNextFinisher(buttonColor, heatNumber);

        // Raise number of finished participants per heat
        // If all participants per heat finished, we also
        // stop the main clock per heat
        raiseFinisherPerHeat(heatNumber);

        // Update leaderboard
        addAthletesTimeToResults(name, strToTime(currentTime));
        updateLeaderboard();

        // Play a sound per finisher :)
        // Sound from http://soundbible.com/478-Cheering-3.html
        var sound = new Audio(audioURL + "cheering.mp3");
        sound.play();
    }
}

/**
 * Marks an athlete in the DOM as finished.
 *
 * @param string    buttonColor Buzzer color, e.g., red or yellow
 * @param int       heatNumber  Number of the heat, e.g., 1 or 4
 */
function setAthleteAsFinished(buttonColor, heatNumber) {
    participantSelectorWrap = "div[data-heat=\"" + heatNumber + "\"] div[data-button=\"" + buttonColor + "\"]";
    $(participantSelectorWrap).attr("data-competition", "finisher");

    $(participantSelectorWrap).removeClass("next-finisher");
    $(participantSelectorWrap).unbind("click");
}

/**
 * Adds the workout time next to the name
 * of the athlete.
 *
 * @param string    buttonColor Buzzer color, e.g., red or yellow
 * @param int       heatNumber  Number of the heat, e.g., 1 or 4
 */
function setAthletesFinishTime(buttonColor, heatNumber) {
    stopwatchSelector = "div[data-heat=\"" + heatNumber + "\"] .stopwatch";
    participantSelector = "div[data-heat=\"" + heatNumber + "\"] div[data-button=\"" + buttonColor + "\"] h2";

    // Get current time of heat and add them
    // next to the participants name.
    currentTime = $(stopwatchSelector).text();
    name = $(participantSelector).text()
    $(participantSelector).append(": <span class=\"score\">" + currentTime + "</span>");
}

/**
 * nextFinisher contains the information
 * which athlete will finish the workout next.
 *
 * In some workouts, this is not sequential (e.g.,
 * athlethes in heat 1 finish first, then heat 2, ...).
 * Sometimes you have strong athletes and they outpace
 * athlethes from the previous workout. This data structure
 * takes care of those cases,
 *
 * Structure:
 *  Key: Button color (e.g., red, yellow)
 *  Value: Head number (e.g., 2, 4)
 */
var nextFinisher = new Map();

/**
 *
 * @param   string buttonColor  Buzzer color, e.g., red or yellow
 * @return  int                 Number of the heat, e.g., 1 or 4
 */
function getCurrentFinisherHeat(buttonColor) {
    return nextFinisher.get(buttonColor)
}

/**
 * setNextFinisher sets the next potential finisher.
 * Based on the buttonColor and the heatNumber, we have a unique
 * athlete combination to set as a next finisher.
 *
 * If the next finisher has already finished (this could be the case
 * because we can mark athletes as next finishers by a click if
 * someone outpace other athletes), we determine automatically the next one
 * in a sequential way.
 *
 * @param string    buttonColor     Buzzer color, e.g., red or yellow
 * @param int       heatNumber      Number of the heat, e.g., 1 or 4
 */
function setNextFinisher(buttonColor, heatNumber) {
    var nextFinisherSelector = "div[data-heat=\"" + heatNumber + "\"] div[data-button=\"" + buttonColor + "\"]";
    competitionState = $(nextFinisherSelector).attr("data-competition");

    if(competitionState == "finisher") {
        heatNumber = determineNextFinisher(buttonColor);
    }

    nextFinisher.set(buttonColor, heatNumber);
    $("div[data-heat=\"" + heatNumber + "\"] div[data-button=\"" + buttonColor + "\"]").addClass("next-finisher");
}

/**
 * determineNextFinisher determines the next athlete based on the
 * buttonColor that should be finish the workout (according the order).
 *
 * @param string buttonColor    Buzzer color, e.g., red or yellow
 * @return int                  Number of the heat, e.g., 1 or 4
 */
function determineNextFinisher(buttonColor) {
    lowestHeat = 1000;
    $("div[data-button=\"" + buttonColor + "\"]:not([data-competition])").each(function(i, e) {
        heatNo = $(e).closest("div[data-heat]").attr("data-heat");
        heatNo = parseInt(heatNo);
        if (heatNo < lowestHeat) {
            lowestHeat = heatNo
        }
    });

    return lowestHeat;
}

/**
 * markAsNextFinisher marks an athlete manually
 * as the next finisher.
 * This is a click handler.
 *
 * @param Element e Element the user clicked on
 */
function markAsNextFinisher(e) {
    buttonColor = $(e).attr("data-button");
    heatNumber = $(e).closest("div[data-heat]").attr("data-heat");
    heatNumber = parseInt(heatNumber);

    $("div[data-button=\"" + buttonColor + "\"].next-finisher").removeClass("next-finisher");
    $(e).addClass("next-finisher");

    nextFinisher.set(buttonColor, heatNumber);
}

/**
 * buttonLastHit contains the information
 * when the button was hit.
 *
 * When an athlete hit the button, it could be
 * that she hits the buzzer multiple times.
 * To avoid multiple finisher registrations we
 * block the buzzer for a certain amount of time.
 * This structure keeps care of this.
 *
 * Structure:
 *  Key: Button color (e.g., red, yellow)
 *  Value: Timestamp
 */
var buttonLastHit = new Map();

/**
 * Sets the last buzzer hit.
 *
 * @param string    buttonColor Buzzer color, e.g., red or yellow
 * @param int       timing      Timestamp when the buzzer was hit
 */
function setButtonLastHit(buttonColor, timing) {
    buttonLastHit.set(buttonColor, timing);
}

/**
 * Returns the last time when buzzer with buttonColor was hit.
 *
 * @param string buttonColor    Buzzer color, e.g., red or yellow
 * @return int                  Timestamp when the buzzer was hit
 */
function getButtonLastHit(buttonColor) {
    return buttonLastHit.get(buttonColor)
}

/**
 * heats contains the information how many
 * athlethes finished the workout already
 * in a specific heat.
 *
 * Structure:
 *  Key: Heat number (e.g., 2, 6)
 *  Value: Number of finishers (e.g., 0, 4)
 */
var heats = new Map();

/**
 * initializeHeats checks how many heats we have
 * and marks every heat with 0 finishers.
 * Because when we start, no athlete has finished
 * the workout ;)
 */
function initializeHeats() {
    $("div[data-heat]").each(function(key, value) {
        heats.set($(value).data("heat"), 0);
    });
}

/**
 * Raise the number of finisher per heat by one.
 *
 * @param int heatNumber    Number of the heat, e.g., 1 or 4
 */
function raiseFinisherPerHeat(heatNumber) {
    finishedParticipants = heats.get(heatNumber) + 1;
    heats.set(heatNumber, finishedParticipants);

    // If we have four finisher per heat, stop the clock
    if (finishedParticipants == 4) {
        stopwatchSelector = "div[data-heat=\"" + heatNumber + "\"] .stopwatch";
        $(stopwatchSelector + " input.stop").click();
    }
}

/**
 * results contains all finished athlethes
 * including their time needed to complete the workout.
 * This structure is mainly used for the leaderboard.
 *
 * Structure:
 *  Key: Name of athlete (e.g., Andy Bau or Ute Klein)
 *  Value: Number of of seconds the athlete took for the workout (e.g., 680, 1022)
 */
var results = new Map();

/**
 * Adds the finish time of an athlete to the results list.
 *
 * @param string    name           Name of the athlete
 * @param int       workoutTime    Time the athlete took for the workout
 */
function addAthletesTimeToResults(name, workoutTime) {
    results.set(name, workoutTime);
}

/**
 * updateLeaderboard updates the main leaderboard.
 * Once an athlete finishes the workout, she will
 * be added into the leaderboard incl. her time.
 */
function updateLeaderboard() {
    if (results.size == 0) {
        return;
    }

    // Sort all finished athlethes according time
    const resultSorted = new Map([...results.entries()].sort((a, b) => a[1] - b[1]));

    // Generate the result table and overwrite the old one.
    // Dirty, yep. But for this usecase, it is fine.
    var i = 1;
    var content = "<table class=\"leaderboard-table\">";
    for (let [key, value] of resultSorted) {
        content += `
        <tr>
            <td class="leaderboard-rank">` + i + `.</td>
            <td class="leaderboard-name">` + key + `</td>
            <td class="leaderboard-time">` + timeToStr(value) + `</td>
        </tr>`;
        i++;
    }
    content += "</table>";
    $('#leaderboard').empty().append(content);
}

/**
 * The main application code.
 * Will be executed, once the DOM is ready.
 */
jQuery(document).ready(function($){
    // Initialize the main clock in the header
    mainClockTicker();

    // Initialize the stopwatches for all heats
    $('#clock1').stopwatch();
    $('#clock2').stopwatch();
    $('#clock3').stopwatch();
    $('#clock4').stopwatch();
    $('#clock5').stopwatch();
    $('#clock6').stopwatch();
    $('#clock7').stopwatch();
    $('#clock8').stopwatch();
    $('#clock9').stopwatch();
    $('#clock10').stopwatch();
    $('#clock11').stopwatch();
    $('#clock12').stopwatch();
    $('#clock13').stopwatch();
    $('#clock14').stopwatch();
    $('#clock15').stopwatch();

    // Set click handler for every athlete
    // If a click on an athlethes name happen,
    // she is marked as the next finisher.
    $(".athlete").click(function(e) {
        markAsNextFinisher(this);
    });

    // Initialize the leaderboard
    updateLeaderboard();

    // Mark all four athletes of heat #1
    // as first finishers
    setNextFinisher("red", 1);
    setNextFinisher("green", 1);
    setNextFinisher("blue", 1);
    setNextFinisher("yellow", 1);

    // Initialize all buttons and that
    // they are never hit so far.
    setButtonLastHit("red", 0);
    setButtonLastHit("green", 0);
    setButtonLastHit("blue", 0);
    setButtonLastHit("yellow", 0);

    // Mark all heats with 0 finishers (yet)
    initializeHeats();

    // Build the websocket URL
    // In our current setup, the buzzer server + the static
    // webserver that serves this files, are running
    // on the same server
    var parser = document.createElement('a');
    parser.href = window.location.href;
    wsURL = "ws://" + parser.host + "/stream"

    // Build the URL of the audio files.
    var audioURL = "http://" + parser.host + parser.pathname + "audio/";

    connectToWebSocket(wsURL, audioURL);
});