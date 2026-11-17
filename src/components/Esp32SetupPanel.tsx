import React, { useState } from 'react';
import { Check, Copy, Cpu, Send, Wifi } from 'lucide-react';
import type { MemberRole, VotingState } from '../types';

interface Esp32SetupPanelProps {
  state: VotingState;
  userRole: MemberRole;
}

export function Esp32SetupPanel({ state, userRole }: Esp32SetupPanelProps) {
  const [boardType, setBoardType] = useState<'esp8266' | 'esp32'>('esp8266');
  const [copied, setCopied] = useState(false);
  const [testContestant, setTestContestant] = useState<number>(1);
  const [testDeviceId, setTestDeviceId] = useState('ESP8266-BENCH-01');
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const esp8266Sketch = `#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL = "${origin}";
const char* DEVICE_ID = "ESP8266-VOTE-01";

// NodeMCU / Wemos D1 Mini Pinout
// OLED I2C: SDA = D2 (GPIO 4), SCL = D1 (GPIO 5)
// LED = D0 (GPIO 16), Buzzer = D8 (GPIO 15)
// Buttons: D5(14), D6(12), D7(13), D3(0), D4(2), RX(3)
const int LED_PIN = 16;
const int BUZZER_PIN = 15;
const int BUTTON_PINS[] = { 14, 12, 13, 0, 2, 3 };
const int MAX_PINS = 6;

int activeContestants = ${state.contestantCount};
int totalVotes = ${state.totalVotes};
bool votingOpen = ${state.votingOpen ? 'true' : 'false'};
unsigned long lastSync = 0;

void showMessage(const String& line1, const String& line2 = "", const String& line3 = "") {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 4);
  display.println(line1);
  display.drawLine(0, 16, 127, 16, SSD1306_WHITE);
  display.setCursor(0, 24);
  display.println(line2);
  display.setCursor(0, 42);
  display.println(line3);
  display.display();
}

void showInstructions() {
  if (!votingOpen) {
    showMessage("VOTING PAUSED", "Polling is closed.", "Wait for admin.");
    return;
  }
  String rangeText = "Press button 1 to " + String(activeContestants);
  String countText = "Total votes: " + String(totalVotes);
  showMessage("READY TO VOTE", rangeText, countText);
}

void beepBuzzer(int durationMs) {
  digitalWrite(BUZZER_PIN, HIGH); // Use tone(BUZZER_PIN, 2000, durationMs) for passive buzzer
  delay(durationMs);
  digitalWrite(BUZZER_PIN, LOW);
}

void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  for (int i = 0; i < MAX_PINS; i++) {
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
  }

  Wire.begin(4, 5); // SDA = GPIO 4 (D2), SCL = GPIO 5 (D1)
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED not found at 0x3C");
  }
  showMessage("VOTING SYSTEM", "Connecting to WiFi...", WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\\nWiFi connected: " + WiFi.localIP().toString());

  syncConfig();
  showInstructions();
}

void syncConfig() {
  if (WiFi.status() != WL_CONNECTED) return;

  std::unique_ptr<BearSSL::WiFiClientSecure> client(new BearSSL::WiFiClientSecure);
  client->setInsecure();

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/esp32/config?deviceId=" + DEVICE_ID + "&rssi=" + String(WiFi.RSSI());

  if (http.begin(*client, url)) {
    int code = http.GET();
    if (code == 200) {
      String payload = http.getString();
      int cIdx = payload.indexOf("\\"contestantCount\\":");
      if (cIdx != -1) {
        activeContestants = payload.substring(cIdx + 18).toInt();
      }
      int vIdx = payload.indexOf("\\"totalVotes\\":");
      if (vIdx != -1) {
        totalVotes = payload.substring(vIdx + 13).toInt();
      }
      votingOpen = payload.indexOf("\\"votingOpen\\":true") != -1;
      showInstructions();
    }
    http.end();
  }
}

void sendVote(int contestantIndex) {
  if (WiFi.status() != WL_CONNECTED) return;

  digitalWrite(LED_PIN, HIGH);
  beepBuzzer(180);

  if (!votingOpen) {
    showMessage("VOTING PAUSED", "Cannot submit vote.", "Wait for admin.");
    delay(1000);
    digitalWrite(LED_PIN, LOW);
    showInstructions();
    return;
  }

  showMessage("SENDING VOTE", "Contestant #" + String(contestantIndex), "Please wait...");

  std::unique_ptr<BearSSL::WiFiClientSecure> client(new BearSSL::WiFiClientSecure);
  client->setInsecure();

  HTTPClient http;
  if (http.begin(*client, String(SERVER_URL) + "/api/esp32/vote")) {
    http.addHeader("Content-Type", "application/json");
    String body = "{\\"contestantIndex\\":" + String(contestantIndex) + ",\\"deviceId\\":\\"" + String(DEVICE_ID) + "\\",\\"rssi\\":" + String(WiFi.RSSI()) + "}";
    int code = http.POST(body);
    if (code == 200) {
      totalVotes++;
      showMessage("VOTE RECORDED!", "Contestant #" + String(contestantIndex), "Thank you for voting");
    } else {
      showMessage("VOTE ERROR", "HTTP " + String(code), "Try again");
      delay(120);
      beepBuzzer(120);
    }
    http.end();
  }

  delay(1000);
  digitalWrite(LED_PIN, LOW);
  showInstructions();
}

void loop() {
  if (millis() - lastSync > 10000) {
    syncConfig();
    lastSync = millis();
  }

  for (int i = 0; i < activeContestants && i < MAX_PINS; i++) {
    if (digitalRead(BUTTON_PINS[i]) == LOW) {
      sendVote(i + 1);
      while (digitalRead(BUTTON_PINS[i]) == LOW) {
        delay(20);
      }
      delay(200);
    }
  }
}`;

  const esp32Sketch = `#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL = "${origin}";
const char* DEVICE_ID = "ESP32-VOTE-01";

const int LED_PIN = 2;
const int BUZZER_PIN = 15;
const int BUTTON_PINS[] = { 13, 12, 14, 27, 26, 25, 33, 32 };
const int MAX_PINS = 8;

int activeContestants = ${state.contestantCount};
int totalVotes = ${state.totalVotes};
bool votingOpen = ${state.votingOpen ? 'true' : 'false'};
unsigned long lastSync = 0;

void showMessage(const String& line1, const String& line2 = "", const String& line3 = "") {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 4);
  display.println(line1);
  display.drawLine(0, 16, 127, 16, SSD1306_WHITE);
  display.setCursor(0, 24);
  display.println(line2);
  display.setCursor(0, 42);
  display.println(line3);
  display.display();
}

void showInstructions() {
  if (!votingOpen) {
    showMessage("VOTING PAUSED", "Polling is closed.", "Wait for admin.");
    return;
  }
  showMessage("READY TO VOTE", "Press button 1 to " + String(activeContestants), "Total votes: " + String(totalVotes));
}

void beepBuzzer(int durationMs) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(durationMs);
  digitalWrite(BUZZER_PIN, LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  for (int i = 0; i < MAX_PINS; i++) {
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
  }
  Wire.begin(21, 22);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  showMessage("VOTING SYSTEM", "Connecting WiFi...", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
  }
  syncConfig();
  showInstructions();
}

void syncConfig() {
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/esp32/config?deviceId=" + DEVICE_ID + "&rssi=" + String(WiFi.RSSI());
  http.begin(client, url);
  int code = http.GET();
  if (code == 200) {
    String payload = http.getString();
    int cIdx = payload.indexOf("\\"contestantCount\\":");
    if (cIdx != -1) activeContestants = payload.substring(cIdx + 18).toInt();
    int vIdx = payload.indexOf("\\"totalVotes\\":");
    if (vIdx != -1) totalVotes = payload.substring(vIdx + 13).toInt();
    votingOpen = payload.indexOf("\\"votingOpen\\":true") != -1;
    showInstructions();
  }
  http.end();
}

void sendVote(int contestantIndex) {
  if (WiFi.status() != WL_CONNECTED) return;
  digitalWrite(LED_PIN, HIGH);
  beepBuzzer(180);
  if (!votingOpen) {
    showMessage("VOTING PAUSED", "Cannot submit vote.", "Wait for admin.");
    delay(1000);
    digitalWrite(LED_PIN, LOW);
    showInstructions();
    return;
  }
  showMessage("SENDING VOTE", "Contestant #" + String(contestantIndex), "Please wait...");
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, String(SERVER_URL) + "/api/esp32/vote");
  http.addHeader("Content-Type", "application/json");
  String body = "{\\"contestantIndex\\":" + String(contestantIndex) + ",\\"deviceId\\":\\"" + String(DEVICE_ID) + "\\",\\"rssi\\":" + String(WiFi.RSSI()) + "}";
  int code = http.POST(body);
  if (code == 200) {
    totalVotes++;
    showMessage("VOTE RECORDED!", "Contestant #" + String(contestantIndex), "Thank you for voting");
  } else {
    showMessage("VOTE ERROR", "HTTP " + String(code), "Try again");
  }
  http.end();
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  showInstructions();
}

void loop() {
  if (millis() - lastSync > 10000) {
    syncConfig();
    lastSync = millis();
  }
  for (int i = 0; i < activeContestants && i < MAX_PINS; i++) {
    if (digitalRead(BUTTON_PINS[i]) == LOW) {
      sendVote(i + 1);
      while (digitalRead(BUTTON_PINS[i]) == LOW) delay(20);
      delay(200);
    }
  }
}`;

  const activeSketch = boardType === 'esp8266' ? esp8266Sketch : esp32Sketch;

  const handleCopySketch = async () => {
    try {
      await navigator.clipboard.writeText(activeSketch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleTestHeartbeat = async () => {
    setSending(true);
    setTestStatus(null);
    try {
      const res = await fetch('/api/esp32/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: testDeviceId.trim() || 'ESP32-BENCH-01',
          rssi: -48,
          firmware: 'v1.0.0',
        }),
      });
      if (res.ok) {
        setTestStatus('ESP32 heartbeat registered on server.');
      } else {
        setTestStatus('Heartbeat request failed.');
      }
    } catch {
      setTestStatus('Network error reaching server.');
    } finally {
      setSending(false);
    }
  };

  const handleTestVote = async () => {
    setSending(true);
    setTestStatus(null);
    try {
      const targetIndex = Math.min(Math.max(1, testContestant), state.contestantCount);
      const res = await fetch('/api/esp32/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contestantIndex: targetIndex,
          deviceId: testDeviceId.trim() || 'ESP32-BENCH-01',
          rssi: -48,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; totalVotes?: number };
      if (res.ok && data.ok) {
        setTestStatus(`Test ballot recorded for Contestant ${targetIndex}. Total ballots: ${data.totalVotes}`);
      } else {
        setTestStatus(data.error || 'Vote rejected by server.');
      }
    } catch {
      setTestStatus('Network error sending test ballot.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              ESP32 HTTP Endpoints
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Point your ESP32 board to these endpoints to sync contestant count and submit physical button votes.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <Cpu className="w-4 h-4 text-slate-500" />
            <span>
              {state.esp32.connected
                ? `Connected (${state.esp32.deviceId || 'ESP32'})`
                : 'Awaiting device signal'}
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-800">Sync Config</p>
            <p className="mt-1 font-mono text-xs text-blue-700 break-all">
              GET /api/esp32/config
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Returns current <span className="font-mono">contestantCount</span> and <span className="font-mono">votingOpen</span> status.
            </p>
          </div>

          <div className="border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-800">Submit Vote</p>
            <p className="mt-1 font-mono text-xs text-blue-700 break-all">
              POST /api/esp32/vote
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Body: <span className="font-mono">{`{"contestantIndex": 1}`}</span> (1 to {state.contestantCount}).
            </p>
          </div>

          <div className="border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-800">Device Heartbeat</p>
            <p className="mt-1 font-mono text-xs text-blue-700 break-all">
              POST /api/esp32/heartbeat
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Body: <span className="font-mono">{`{"deviceId": "ESP32-01"}`}</span> to keep status online.
            </p>
          </div>
        </div>
      </section>

      {userRole !== 'viewer' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">
              Hardware Endpoint Test
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Send a real HTTP request to the ESP32 API endpoints to verify live dashboard sync before flashing your board.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor="esp-device-id"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Device ID
              </label>
              <input
                id="esp-device-id"
                type="text"
                value={testDeviceId}
                onChange={(e) => setTestDeviceId(e.target.value)}
                className="w-44 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="esp-contestant-select"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Contestant Button
              </label>
              <select
                id="esp-contestant-select"
                value={Math.min(testContestant, state.contestantCount)}
                onChange={(e) => setTestContestant(Number(e.target.value))}
                className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {state.contestants.map((c) => (
                  <option key={c.index} value={c.index}>
                    #{c.index} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleTestHeartbeat}
              disabled={sending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Wifi className="w-4 h-4" />
              <span>Ping Heartbeat</span>
            </button>

            <button
              type="button"
              onClick={handleTestVote}
              disabled={sending || !state.votingOpen}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>Send Test Vote</span>
            </button>
          </div>

          {testStatus && (
            <p className="mt-3 text-xs font-medium text-slate-700">{testStatus}</p>
          )}
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Arduino Sketch ({boardType === 'esp8266' ? 'ESP8266 / NodeMCU' : 'ESP32'})
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Pre-filled with this server URL and {state.contestantCount} active contestants.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setBoardType('esp8266');
                  setCopied(false);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  boardType === 'esp8266'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ESP8266
              </button>
              <button
                type="button"
                onClick={() => {
                  setBoardType('esp32');
                  setCopied(false);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  boardType === 'esp32'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ESP32
              </button>
            </div>
            <button
              type="button"
              onClick={handleCopySketch}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Sketch</span>
                </>
              )}
            </button>
          </div>
        </div>

        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs font-mono leading-relaxed text-slate-100">
          <code>{activeSketch}</code>
        </pre>
      </section>
    </div>
  );
}
