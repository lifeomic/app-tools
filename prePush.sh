# pre-push hook args: <local_ref> <local_sha1> <remote_ref> <remote_sha1>
local_sha1=$1
remote_sha1=$3

echo "Pre-push: checking to see if the CHANGELOG should be updated..."

# fetch latest refs
git remote update
num_new_commits_compared_to_master=$(git rev-list HEAD...origin/master --count)

# if there are new commits..
if [ -n $num_new_commits_compared_to_master ]; then
  changelog_already_updated=$(git diff --name-only HEAD~1 HEAD | grep CHANGELOG.md)
  # and the latest commit didn't update the CHANGELOG
  if [ ! $changelog_already_updated ]; then
    yarn auto-changelog --unreleased && git add CHANGELOG.md && git commit -m 'pre-push auto-changelog update'
  fi
fi
