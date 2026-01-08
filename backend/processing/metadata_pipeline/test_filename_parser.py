"""Tests for intelligent filename parser."""

from .filename_parser import parse_filename, should_parse_filename


def test_aoa_miniskirt():
    """Test parsing 'AOA - Miniskirt M V'."""
    results = parse_filename("AOA - Miniskirt M V")

    assert len(results) > 0
    top_result = results[0]

    assert top_result.artist == "AOA"
    assert top_result.title == "Miniskirt"
    assert top_result.confidence > 0.8


def test_alleycvt_throw_it_down():
    """Test parsing 'ALLEYCVT - Throw it down'."""
    results = parse_filename("ALLEYCVT - Throw it down")

    assert len(results) > 0
    top_result = results[0]

    assert top_result.artist == "ALLEYCVT"
    assert top_result.title == "Throw it down"
    assert top_result.confidence > 0.8


def test_with_extension():
    """Test parsing with file extension."""
    results = parse_filename("AOA - Miniskirt M V.mp3")

    assert len(results) > 0
    top_result = results[0]

    assert top_result.artist == "AOA"
    assert top_result.title == "Miniskirt"
    assert ".mp3" not in top_result.title


def test_various_dash_types():
    """Test different dash separators."""
    test_cases = [
        "Artist - Title",
        "Artist – Title",  # en dash
        "Artist — Title",  # em dash
    ]

    for filename in test_cases:
        results = parse_filename(filename)
        assert len(results) > 0
        assert results[0].artist == "Artist"
        assert results[0].title == "Title"


def test_underscore_separator():
    """Test underscore-separated filenames."""
    results = parse_filename("Artist_Title_Song")

    assert len(results) > 0
    # Should try to parse this
    found_underscore = any(
        r.artist == "Artist" and "Title" in r.title
        for r in results
    )
    assert found_underscore


def test_no_artist_fallback():
    """Test fallback when no artist pattern detected."""
    results = parse_filename("Just A Song Title")

    assert len(results) > 0
    # Should have a fallback with no artist
    fallback = [r for r in results if r.artist is None]
    assert len(fallback) > 0
    assert fallback[0].title == "Just A Song Title"


def test_should_parse_with_dash():
    """Test should_parse_filename returns True for dash-separated titles."""
    assert should_parse_filename("Artist - Title", None)
    assert should_parse_filename("AOA - Miniskirt M V", None)


def test_should_not_parse_with_existing_artist():
    """Test should_parse_filename returns False when artist exists and title is clean."""
    assert not should_parse_filename("Song Title", "Artist Name")
    assert not should_parse_filename("Just A Title", "Known Artist")


def test_should_parse_override_artist():
    """Test should_parse_filename when title contains different artist."""
    # If title is "NewArtist - Song" but DB has "OldArtist", should parse
    assert should_parse_filename("NewArtist - Song Title", "OldArtist")


def test_complex_title_cleaning():
    """Test cleaning of complex titles with artifacts."""
    results = parse_filename("Artist - Title (Official Audio) [HD]")

    assert len(results) > 0
    top = results[0]
    assert top.artist == "Artist"
    assert "Official" not in top.title
    assert "Audio" not in top.title
    assert "HD" not in top.title


def test_year_removal():
    """Test removal of year tags."""
    results = parse_filename("Artist - Title (2024)")

    assert len(results) > 0
    assert results[0].artist == "Artist"
    assert "2024" not in results[0].title


if __name__ == "__main__":
    # Run tests
    test_aoa_miniskirt()
    test_alleycvt_throw_it_down()
    test_with_extension()
    test_various_dash_types()
    test_underscore_separator()
    test_no_artist_fallback()
    test_should_parse_with_dash()
    test_should_not_parse_with_existing_artist()
    test_should_parse_override_artist()
    test_complex_title_cleaning()
    test_year_removal()

    print("All tests passed!")
