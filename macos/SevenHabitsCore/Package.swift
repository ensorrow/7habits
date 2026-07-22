// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "SevenHabitsCore",
  platforms: [
    .macOS(.v14),
  ],
  products: [
    .library(name: "SevenHabitsCore", targets: ["SevenHabitsCore"]),
  ],
  targets: [
    .target(
      name: "SevenHabitsCore",
      path: "Sources/SevenHabitsCore"
    ),
    .testTarget(
      name: "SevenHabitsCoreTests",
      dependencies: ["SevenHabitsCore"],
      path: "Tests/SevenHabitsCoreTests"
    ),
  ]
)
