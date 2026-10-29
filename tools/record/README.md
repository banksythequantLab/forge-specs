# Recording the demo (reproducible take)

The video is a screen recording of the Lens Studio preview, driven by the LEAF `demo_run` scenario so every take is the same.

1. `mcp-lib.ps1` — talks to the Lens Studio MCP (`.mcp.json`) from PowerShell: `Invoke-LsMcp -Tool MovePreviewCamera -ArgsJson '{...}'`.
2. `rec.py` — 30 fps capture of a screen rectangle with dxcam (Desktop Duplication → ffmpeg/libx264). ffmpeg's gdigrab managed 4 fps on this laptop and ddagrab hung on the hybrid GPU.
3. `take.ps1 -Name take4` — refreshes the Lens, sets the seated pose, starts the recorder on the preview viewport, waits for the opening frame, moves to the lean-in pose and runs `demo_run` (`run-demo.ps1`), then stops. Lens Studio must be the foreground window; `wait-and-take.ps1` waits for that (and for the user to be idle) before recording.
4. `edit.py take4.mp4 <vo dir> forge-demo.mp4` — cuts the take to the narration segments (`service/tools/vo-segments.txt`, synthesized with `service/tools/vo-generate.sh`), freezing or speeding up where the narration and the take differ, crops out the LEAF banner, and adds the title overlays.

Gotchas found on the way: a console launched through WMI pops up in front of Lens Studio and gets recorded (launch hidden); JSON passed through nested `powershell -File` calls loses its quotes (call the MCP in-process); the Lens Studio dock widget's `mapToGlobal` did not match the screen, so the viewport rectangle was measured from a screenshot.
