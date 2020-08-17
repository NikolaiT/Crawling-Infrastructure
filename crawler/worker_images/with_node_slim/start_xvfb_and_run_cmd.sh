#!/bin/bash

# if [ "$USING_XVFB" = "1" ];
# then
#     echo "[DOCKER] Starting X virtual framebuffer using: Xvfb $DISPLAY -ac -screen 0 $XVFB_WHD -nolisten tcp";
#     Xvfb $DISPLAY -ac -screen 0 $XVFB_WHD -nolisten tcp &
# fi

if [ "$TEST_PPTR_HEADFUL" = "1" ];
then
    echo "[DOCKER] Testing that pptr works"
    node worker_images/with_node_slim/pptr_test.js
fi

echo "[DOCKER] Starting worker server"
node dist/crawler/src/server/server.js
exit 0
