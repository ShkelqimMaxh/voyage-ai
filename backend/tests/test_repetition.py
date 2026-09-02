"""What the host must not say twice.

Every case here is a repetition that reached a real drive transcript.
"""
from app.models.schemas import DrivePace, Place, ScriptRequest, Topic
from app.services.claude_scripts import (
    _packet,
    place_key,
    spent_names,
    strip_locator_sentences,
    times_here,
)


def _request(previous=(), covered=(), said=()):
    return ScriptRequest(
        place=Place(
            id="node:7340611878",
            name="Lubozhdë",
            kind="village",
            country="Kosovo",
            municipality="Komuna e Istogut",
            latitude=42.77,
            longitude=20.44,
            road_name="Mirsad Idrizaj",
            summary="Mirsad Idrizaj, Lubozhdë, Komuna e Istogut, Kosovo",
        ),
        topic=Topic("history"),
        pace=DrivePace.urban,
        locale="en",
        previous_place_ids=list(previous),
        already_covered_here=list(covered),
        already_said=list(said),
        continuation=bool(said),
    )


def test_repeat_visits_count_by_village_not_osm_node():
    """Reverse geocoding returned ten ids for one village on a 5 km road."""
    ids = ["vrelle", "lubozhde", "lubozhde"]
    assert times_here(_request(previous=ids)) == 2
    assert place_key("Lubozhdë") == place_key("lubozhde")


def test_first_visit_still_gets_the_street():
    packet = _packet(_request())
    assert packet["place"]["road_name"] == "Mirsad Idrizaj"
    assert packet["unique_nouns"]["street_you_are_on"] == "Mirsad Idrizaj"


def test_repeat_visit_is_never_handed_the_street_again():
    """Nulling unique_nouns was not enough: road_name and the address-line
    summary carried the name straight back into the briefing."""
    packet = _packet(_request(previous=["lubozhde"]))
    assert packet["times_here"] == 1
    assert packet["unique_nouns"]["street_you_are_on"] is None
    assert "road_name" not in packet["place"]
    assert packet["place"]["summary"] is None
    assert packet["briefing"]["known_text"] is None


def test_previous_scripts_are_redacted_before_they_prime():
    said = ["Here in Lubozhdë, we're on Mirsad Idrizaj street, named for a local hero."]
    packet = _packet(_request(previous=["lubozhde"], covered=["Mirsad Idrizaj, KLA commander"], said=said))
    assert "Mirsad Idrizaj" not in " ".join(packet["already_said"])


def test_a_named_person_is_spent_once_covered():
    assert "Mirsad Idrizaj" in spent_names(["Mirsad Idrizaj, KLA commander, died 1999"])
    packet = _packet(_request(previous=["lubozhde"], covered=["Mirsad Idrizaj, KLA commander"]))
    assert "Mirsad Idrizaj" in packet["names_already_spent"]


def test_locator_sentences_are_cut_wherever_they_sit():
    """Four of eleven street mentions on one drive sat mid-clip, out of reach
    of a lead-only trim."""
    spoken = (
        "So we've just come into Lubozhdë, but you'll also hear this village called Ljubožda. "
        "It's common around here in the Istog municipality for places to carry two names. "
        "We're on Mirsad Idrizaj street, and that dual naming is part of the local fabric. "
        "You'll see it on signs and hear it from locals, and nobody minds which one you use."
    )
    trimmed = strip_locator_sentences(spoken, _request(previous=["lubozhde"]), None)
    assert "Mirsad Idrizaj" not in trimmed
    assert "two names" in trimmed


def test_a_passing_mention_survives_the_scrub():
    """Only sentences whose job is re-stating where we are get dropped."""
    spoken = (
        "Mirsad Idrizaj was a commander in the Kosovo Liberation Army, originally from Istog. "
        "He was killed during the war, and the community named this road for him afterwards. "
        "Many families here still remember the day it happened, and they mark it every year."
    )
    trimmed = strip_locator_sentences(spoken, _request(previous=["lubozhde"]), None)
    assert trimmed == spoken


def test_the_checklist_wraps_instead_of_jamming_on_its_last_rung():
    """Indexing with min(visits, last) gave three clips in a row about diaspora
    money once a stop ran past the end of the list."""
    from app.services.claude_scripts import SUBJECT_LADDER, required_subject

    assert required_subject(0) == SUBJECT_LADDER[0]
    assert required_subject(5) == SUBJECT_LADDER[5]
    late = required_subject(len(SUBJECT_LADDER) + 3)
    assert late != SUBJECT_LADDER[-1]
    assert "NOT in" in late


def test_a_point_already_aired_is_caught_however_reworded():
    from app.services.claude_scripts import repeats_covered_point

    aired = ["Monastery of the Mother of God in Hvosno, north of Peja"]
    assert repeats_covered_point("Mother of God Monastery, Hvosno, near Mokra", aired)
    assert repeats_covered_point("Ibrahim Rugova, first President of Kosovo, born here", aired) is None


def test_drive_wide_keys_outlive_the_village_thread():
    """The per-village thread is dropped on leaving, so this is what stops the
    same monastery being introduced again two villages later."""
    packet = _packet(_request(previous=["lubozhde"], covered=[]))
    assert packet["nothing_here_may_repeat"] == []
    req = _request(previous=["lubozhde"])
    req.covered_keys = ["Monastery of the Mother of God, Hvosno"]
    assert "Monastery of the Mother of God, Hvosno" in _packet(req)["nothing_here_may_repeat"]


def test_conversational_scaffolding_does_not_collide_two_good_clips():
    """A flat two-word rule threw away twelve clips on one drive: "speaking",
    "beyond" and "history" are not content."""
    from app.services.claude_scripts import repeats_covered_point

    aired = ["Speaking of history, Ali Hadri the historian from Istog"]
    fresh = "Beyond the history we discussed, families expanding trout farms"
    assert repeats_covered_point(fresh, aired) is None


def test_a_genuine_repeat_still_collides():
    from app.services.claude_scripts import repeats_covered_point

    aired = ["Trout farms on the White Drin supply Istog restaurants"]
    assert repeats_covered_point("White Drin trout farms supplying restaurants in Istog", aired)


def test_overlap_must_be_proportional_not_just_absolute():
    """Two shared words out of three is a repeat; two out of ten is two clips
    that both happen to mention Istog."""
    from app.services.claude_scripts import repeats_covered_point

    aired = ["Istog municipality governs fifty villages including Cerrce and Lubozhde plus Vrelle"]
    assert repeats_covered_point("Istog market supplied by Cerrce farmers", aired) is None


def test_asking_for_more_is_the_one_case_where_repeating_is_right():
    from app.services.ask import wants_more

    assert wants_more("tell me more about Rugova")
    assert wants_more("wait, what was that name again?")
    assert wants_more("say that again")
    assert wants_more("sorry, didn't catch that")
    assert not wants_more("who else is from here?")
    assert not wants_more("is there anywhere good to eat in Istog?")
