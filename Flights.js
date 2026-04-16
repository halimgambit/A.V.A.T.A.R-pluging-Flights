import fetch from "node-fetch";

export async function action(data, callback) {

  try {

    const tblActions = {
      askType: () => askType(data.client)
    };

    info("Flights:", data.action.command, L.get("plugin.from"), data.client);

    const command = tblActions[data.action.command];

    if (!command) {
      Avatar.speak("Commande inconnue", data.client);
      return callback();
    }

    await command();

  } catch (err) {
    if (data.client) Avatar.Speech.end(data.client);
    if (err.message) error(err.message);
  }

  callback();
}


function getApiKey(client) {
  const key = Config?.modules?.Flights?.API_KEY;

  if (!key) {
    Avatar.speak("Clé API manquante dans la configuration Flights", client);
    return null;
  }

  return key;
}

// ===============================
// ASK 1 : TYPE DE RECHERCHE
// ===============================
function askType(client) {

  Avatar.askme(
    "Tu veux les vols depuis Paris, vers une destination ou une compagnie ?",
    client,
    {
      "paris": "airport",
      "depuis paris": "airport",
      "destination": "destination",
      "une destination": "destination",
      "compagnie": "airline",
      "une compagnie": "airline",
      "*": "generic",
      "annule": "cancel",
      "terminer": "cancel"
    },
    15,
    (answer, end) => {

      end(client);

      if (answer === "cancel") {
        return Avatar.speak("D'accord j'annule", client);
      }

      // réponse libre
      if (answer.startsWith("generic:")) {
        const value = answer.split(":")[1];
        return handleGeneric(client, value);
      }

      switch (answer) {
        case "airport":
          getFlights(client, { airport: "CDG" });
          break;

        case "destination":
          askDestination(client);
          break;

        case "airline":
          askAirline(client);
          break;

        default:
          Avatar.speak("Je n'ai pas compris", client);
      }
    }
  );
}

// ===============================
// ASK 2 : DESTINATION
// ===============================
function askDestination(client) {

  Avatar.askme(
    "Quelle destination ?",
    client,
    {
      "*": "generic",
      "annule": "cancel",
      "terminer": "cancel"
    },
    15,
    (answer, end) => {

      end(client);

      if (answer === "cancel") {
        return Avatar.speak("Annulé", client);
      }

      const city = answer.split(":")[1];

      const map = {
        "rome": "FCO",
        "florence": "FLR",
        "sofia": "SOF",
        "malte": "MLA"
      };

      const code = map[city.toLowerCase()];

      if (!code) {
        return Avatar.speak("Destination inconnue", client);
      }

      getFlights(client, { airport: "CDG", destination: code });
    }
  );
}

// ===============================
// ASK 3 : COMPAGNIE
// ===============================
function askAirline(client) {

  Avatar.askme(
    "Quelle compagnie ?",
    client,
    {
      "*": "generic",
      "annule": "cancel",
      "terminer": "cancel"
    },
    15,
    (answer, end) => {

      end(client);

      if (answer === "cancel") {
        return Avatar.speak("Annulé", client);
      }

      const name = answer.split(":")[1].toLowerCase();

      const map = {
        "air france": "AF",
        "klm": "KL",
        "qatar": "QR"
      };

      const code = map[name];

      if (!code) {
        return Avatar.speak("Compagnie inconnue", client);
      }

      getFlights(client, { airport: "CDG", airline: code });
    }
  );
}

// ===============================
// GENERIC DIRECT (smart)
// ===============================
function handleGeneric(client, value) {

  value = value.toLowerCase().trim();

  // 🎯 statut vol
  const matchFlight = value.match(/[a-z]{2}\d{2,4}/i);
  if (matchFlight) {
    return getFlightStatus(client, matchFlight[0].toUpperCase());
  }

  // 🌍 destination
  if (value.includes("rome")) {
    return getSchedules(client, { airport: "CDG", destination: "FCO" });
  }

  // 🛫 général
  return getSchedules(client, { airport: "CDG" });
}

async function getSchedules(client, params) {

  const API_KEY = getApiKey(client);
  if (!API_KEY) return;

  let url = `https://api.aviationstack.com/v1/flight_schedules?access_key=${API_KEY}&dep_iata=${params.airport}&limit=10`;

  if (params.destination) url += `&arr_iata=${params.destination}`;

  const response = await fetch(url);

  if (!response.ok) {
    return Avatar.speak("Erreur récupération planning des vols", client);
  }

  const data = await response.json();

  if (!data.data || data.data.length === 0) {
    return Avatar.speak("Aucun vol programmé", client);
  }

  const flights = data.data;

  flights.sort((a, b) =>
    new Date(a.departure.scheduled) - new Date(b.departure.scheduled)
  );

  const next = flights[0];

  const time = new Date(next.departure.scheduled)
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  Avatar.speak(
    `Prochain vol ${next.airline.name} vers ${simplify(next.arrival.airport)} à ${time}`,
    client
  );
}


async function getFlightStatus(client, flightNumber) {

  const API_KEY = getApiKey(client);
  if (!API_KEY) return;

  const url = `https://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_iata=${flightNumber}`;

  const response = await fetch(url);

  if (!response.ok) {
    return Avatar.speak("Erreur récupération statut", client);
  }

  const data = await response.json();

  if (!data.data || data.data.length === 0) {
    return Avatar.speak("Vol introuvable", client);
  }

  const flight = data.data[0];

  Avatar.speak(
    `Le vol ${flightNumber} est actuellement ${flight.flight_status}`,
    client
  );
}


// ===============================
// API CALL
// ===============================
async function getFlights(client, params) {

  const API_KEY = getApiKey(client);
  if (!API_KEY) return;

  let url = `https://api.aviationstack.com/v1/flights?access_key=${API_KEY}&dep_iata=${params.airport}&limit=10`;

  if (params.destination) url += `&arr_iata=${params.destination}`;
  if (params.airline) url += `&airline_iata=${params.airline}`;

  const response = await fetch(url);

  if (!response.ok) {
    return Avatar.speak("Erreur lors de la récupération des vols", client);
  }

  const data = await response.json();

  if (!data.data || data.data.length === 0) {
    return Avatar.speak("Aucun vol trouvé", client);
  }

  const seen = new Set();
  const flights = [];

  data.data.forEach(f => {
    const id = f.codeshared ? f.codeshared.flight_iata : f.flight.iata;
    if (!seen.has(id)) {
      seen.add(id);
      flights.push(f);
    }
  });

  flights.sort((a, b) =>
    new Date(a.departure.scheduled) - new Date(b.departure.scheduled)
  );

  const now = new Date();

  const next = flights.find(f =>
    new Date(f.departure.scheduled) > now
  );

  if (!next) {
    return Avatar.speak("Aucun vol à venir", client);
  }

  const time = new Date(next.departure.scheduled)
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  Avatar.speak(
    `Prochain vol ${next.airline.name} vers ${simplify(next.arrival.airport)} à ${time}`,
    client
  );
}

// ===============================
// UTILS
// ===============================
function simplify(name) {
  return name.split("(")[0].trim();
}

