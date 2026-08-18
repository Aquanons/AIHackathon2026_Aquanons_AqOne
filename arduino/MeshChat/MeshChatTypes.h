#pragma once

// One queued relay message, plus the sizes it is built from.
//
// This lives in a header rather than in MeshChat.ino because the Arduino
// preprocessor hoists generated function prototypes to just after the last
// #include - ahead of anything the sketch itself declares. A struct defined in
// the .ino would therefore be unknown at the point popUplink(OutMsg&) gets
// prototyped, and the sketch fails to compile with "'OutMsg' was not declared
// in this scope" pointing at a line where it plainly is.

const int MAX_MSG_BYTES = 256;
const int MAX_NAME_BYTES = 64;

// Fixed-size buffers rather than String: the queue is written from the
// AsyncTCP task while the mutex is held, and heap allocation there is what
// turns a busy chat into a fragmented-heap reboot.
struct OutMsg {
  char sender[MAX_NAME_BYTES + 1];
  char text[MAX_MSG_BYTES + 1];
};
