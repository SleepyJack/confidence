# Scratchpad for todo list

* Clean up version.txt if it's deprecated by config.json
* Rename the 'source' in the static questions.json to say something like `demo (claude)` so it's easy to tell when it's not doing live gen
* Fallback to `demo` questions if live response fails with retries
* Give more feedback from `next question` API to front end. If it fails, say why at least.
* Do some sanity checking of the sources gemeni provides
    * Check that it's a live site (200 response)
    * Try to find the answer figure in the page's HTML
        * Only do this if it's not too brittle or prone to false positives. E.g. if gemeni says answer "300000000" and the page says "300 million" how will we detect that?
