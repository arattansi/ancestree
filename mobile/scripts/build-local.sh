#!/usr/bin/env bash
# Builds the production app on this Mac instead of on EAS's servers (Step
# 204). The free plan allows 15 cloud builds a month per platform; a local
# build uses none of them, with the same profile, signing and build number.
#
#   npm run build:ios                 the .ipa, then sent to TestFlight
#   npm run build:ios -- --no-submit  the .ipa only
#   npm run build:android             the .apk, for a GitHub release
#
# Files land in mobile/builds/ (git-ignored). Needs Xcode, CocoaPods and
# fastlane for iOS; JDK 17 and the Android SDK for Android (README).
set -euo pipefail

platform="${1:-}"
submit=yes
[[ "${2:-}" == "--no-submit" ]] && submit=no
case "$platform" in
  ios | android) ;;
  *) echo "usage: build-local.sh ios|android [--no-submit]" >&2; exit 64 ;;
esac

cd "$(dirname "$0")/.."
# CocoaPods and fastlane stop on an encoding error without a UTF-8 locale.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
# A Gradle daemon left behind holds gigabytes the Mac runs short of.
export GRADLE_OPTS="${GRADLE_OPTS:-} -Dorg.gradle.daemon=false"

eas() { npx -y eas-cli@24.14.0 "$@"; }

mkdir -p builds
ext=$([[ "$platform" == ios ]] && echo ipa || echo apk)
out="builds/ancestree-$platform-$(date +%Y%m%d-%H%M).$ext"

eas build --local --non-interactive --profile production --platform "$platform" --output "$out"
echo "Built $out"

if [[ "$platform" == ios && "$submit" == yes ]]; then
  eas submit --non-interactive --profile production --platform ios --path "$out"
fi
