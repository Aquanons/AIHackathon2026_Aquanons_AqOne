-- Buoys carry two radios with very different ranges, per docs/01_ARCHITECTURE.md:
--
--   phone -> buoy          WiFi SoftAP   short  (docs/03_PHONE_BUOY_WIFI.md)
--   buoy  -> buoy/gateway  LoRa SX1262   long   (docs/02_LOAM_PACKET_SPEC.md)
--
-- contact_radius_m was previously the only radius and modelled the WiFi hop,
-- which meant the mesh had no notion of buoy-to-buoy reach at all: buoys sat
-- 4-9 km apart with ~1 km circles and could not have relayed anything.
--
-- lora_radius_m is the buoy-to-buoy and buoy-to-gateway link range.
-- is_gateway_linked marks the buoy that reaches a shore station directly and is
-- therefore the mesh's exit to the internet.

ALTER TABLE buoys ADD COLUMN IF NOT EXISTS lora_radius_m INTEGER;
ALTER TABLE buoys ADD COLUMN IF NOT EXISTS is_gateway_linked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN buoys.contact_radius_m IS 'WiFi SoftAP range for phone contact, metres';
COMMENT ON COLUMN buoys.lora_radius_m IS 'LoRa range for buoy-to-buoy and buoy-to-gateway relay, metres';
COMMENT ON COLUMN buoys.is_gateway_linked IS 'True when this buoy is within LoRa range of a shore gateway';
