# Forge — scene rebuild recipe

The Forge scene graph is built from these calls. Assets (meshes, materials, font,
InternetModule, the ForgeCache GLB/JSON imports) already live on disk under `Assets/`
with pinned `.meta` UUIDs, so only the **scene objects** need rebuilding if the scene
is ever lost before a save.

## Asset UUIDs (pinned by .meta)

| Asset | UUID |
|---|---|
| ForgeBox.mesh | `009438f3-890a-48dd-b71c-e2441e1ac9c4` |
| ForgeCone.mesh | `c055bedd-079a-426c-82bf-029a7ca05a92` |
| ForgeCylinder.mesh | `42fabfa9-a341-4ece-a8f1-0fca646ab0bb` |
| ForgeDeskSurface.mat (SimplePBR) | `0e930cc9-50ff-442b-a107-9d47443328d8` |
| ForgeDeskFrame.mat (SimplePBR) | `b012c589-926b-48bd-a6d4-bef136bcdd38` |
| ForgePrinterShell.mat (SimplePBR) | `a704dd52-ec75-4375-988b-e975ead0ff16` |
| ForgeSurfaceLight.mat (Unlit) | `67f52796-7e7e-4bed-ba6a-e0fb221f1d11` |
| ForgeSurfaceMid.mat (Unlit) | `c190f31d-a7ee-4b20-9ff7-05dc70f1574a` |
| ForgeEdgeMat.mat (Unlit) | `743b78f0-959d-46ae-ac08-5e352a8c28a6` |
| ForgePartMat.mat (SimplePBR) | `5eb5f06e-2143-4b3d-bfb3-1a43d9a1f359` |
| ForgeInternet.internetModule | `d1d61489-f20c-4419-b364-1f277b5d9396` |
| Inter font | `823e307a-82e2-49a0-944b-3a498f4e42f5` |
| hook.glb prefab | `42497154-c166-42f9-957d-b6b19ed02611` |
| clip.glb prefab | `225b73e9-9d62-4521-bb11-8a4f3b33bd71` |
| tag.glb prefab | `57190757-c0ef-44ca-8975-772044ab4d9d` |
| hook.json | `ea27bf44-6eae-42b8-9950-0529601fe15f` |
| clip.json | `01c86614-e9c0-4149-b827-37a99bb67231` |
| tag.json | `c0804782-7756-4c27-b4c4-fbfa3ca88e61` |
| ForgeApp.ts | `6a277280-c9a2-4c1f-a5a5-67fe702f5151` |

If a UUID no longer resolves, look it up again with
`asset-graphql { allAssets(nameContains: "Forge") { id name path } }`.

## Geometry

World is centimetres, user's eyes at the origin looking down -Z.
Floor y = -150, desk top y = -75 (75 cm above the floor), desk front edge z = -40.

Camera Object: position `[0,0,0]`, `near` 5, `far` 2000, plus a `DeviceTracking`
component with `deviceTrackingMode: World`.

| Object | Parent | Position | Scale | Material |
|---|---|---|---|---|
| Forge | — | 0,0,0 | 1,1,1 | — |
| DeskRig | Forge | 0,0,0 | 1,1,1 | — |
| DeskTop | DeskRig | 0,-77,-70 | 120,4,60 | ForgeDeskSurface |
| DeskLeg FL | DeskRig | -55,-114.5,-45 | 6,71,6 | ForgeDeskFrame |
| DeskLeg FR | DeskRig | 55,-114.5,-45 | 6,71,6 | ForgeDeskFrame |
| DeskLeg BL | DeskRig | -55,-114.5,-95 | 6,71,6 | ForgeDeskFrame |
| DeskLeg BR | DeskRig | 55,-114.5,-95 | 6,71,6 | ForgeDeskFrame |
| DeskEdgeHighlight *(disabled)* | DeskRig | 0,-74.5,-40.3 | 16,0.7,1.4 | ForgeEdgeMat |
| PrinterRig | Forge | 0,0,0 | 1,1,1 | — |
| PrinterTable | PrinterRig | 150,-77,-70 | 60,4,60 | ForgeDeskSurface |
| PrinterTableLeg FL | PrinterRig | 126,-114.5,-46 | 5,71,5 | ForgeDeskFrame |
| PrinterTableLeg FR | PrinterRig | 174,-114.5,-46 | 5,71,5 | ForgeDeskFrame |
| PrinterTableLeg BL | PrinterRig | 126,-114.5,-94 | 5,71,5 | ForgeDeskFrame |
| PrinterTableLeg BR | PrinterRig | 174,-114.5,-94 | 5,71,5 | ForgeDeskFrame |
| PrinterBody | PrinterRig | 150,-62,-70 | 28,26,28 | ForgePrinterShell |
| PrinterBed | PrinterRig | 150,-63,-70 | 22,1.2,22 | ForgeSurfaceLight |
| PrinterGantry | PrinterRig | 150,-52,-70 | 31,2.5,4 | ForgeSurfaceLight |
| PrinterRingAnchor | PrinterRig | 150,-39,-70 | 1,1,1 | — |
| ForgeUI | Forge | 0,0,0 | 1,1,1 | — |
| ForgeApp | Forge | 0,0,0 | 1,1,1 | ScriptComponent → `Scripts/Forge/ForgeApp.ts` |

Every box uses `ForgeBox.mesh` (a unit cube, so scale == size in cm).

Also instantiate the SIK prefab at the scene root:
`@asset:Packages/InteractionKit.lspkg/Prefabs/InteractionKit.prefab`

## ForgeApp script inputs

| Input | Asset / object |
|---|---|
| boxMesh / coneMesh / cylinderMesh | ForgeBox / ForgeCone / ForgeCylinder |
| unlitMaterial | ForgeSurfaceLight |
| partMaterial | ForgePartMat |
| font | Inter |
| hookPrefab / clipPrefab / tagPrefab | hook / clip / tag glb prefabs |
| hookJson / clipJson / tagJson | hook / clip / tag json |
| internetModule | ForgeInternet |
| cameraObject | Camera Object |
| deskEdgeHighlight | DeskEdgeHighlight |
| printerRingAnchor | PrinterRingAnchor |
| simulateOffline | false |

## Packages required

`InteractionKit.lspkg` (**not** `SpectaclesInteractionKit.lspkg` — UIKit and LEAF both
import `InteractionKit.lspkg/...`), `SpectaclesUIKit.lspkg`, `Motion.lspkg`
(UIKit's tween engine — UIKit does not compile without it), `Leaf.lspkg`, `Bitmoji 3D.lsc`.
