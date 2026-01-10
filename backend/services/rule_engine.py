"""
Rule Engine for Smart Playlists

Parses, validates, and compiles rule definitions to SQL queries.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Literal, Union

logger = logging.getLogger(__name__)

# Maximum limits to prevent abuse
MAX_CONDITIONS = 50
MAX_NESTING_DEPTH = 3


class Operator(Enum):
    """Supported operators for rule conditions."""

    # String operators
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    REGEX = "regex"
    SAME_AS = "same_as"

    # Numeric operators
    GREATER = "greater"
    GREATER_OR_EQUAL = "greater_or_equal"
    LESS = "less"
    LESS_OR_EQUAL = "less_or_equal"
    BETWEEN = "between"
    YEARS_AGO = "years_ago"

    # List operators
    IN_LIST = "in_list"
    NOT_IN_LIST = "not_in_list"

    # Boolean operators
    IS_TRUE = "is_true"
    IS_FALSE = "is_false"

    # Null operators
    IS_NULL = "is_null"
    IS_NOT_NULL = "is_not_null"

    # Date operators
    BEFORE = "before"
    AFTER = "after"
    WITHIN_DAYS = "within_days"
    NEVER = "never"

    # Similarity operators
    TOP_N = "top_n"


# Operators valid for each field type
OPERATORS_BY_TYPE = {
    "string": {
        Operator.EQUALS,
        Operator.NOT_EQUALS,
        Operator.CONTAINS,
        Operator.NOT_CONTAINS,
        Operator.STARTS_WITH,
        Operator.ENDS_WITH,
        Operator.REGEX,
        Operator.SAME_AS,
        Operator.IN_LIST,
        Operator.NOT_IN_LIST,
        Operator.IS_NULL,
        Operator.IS_NOT_NULL,
    },
    "number": {
        Operator.EQUALS,
        Operator.NOT_EQUALS,
        Operator.GREATER,
        Operator.GREATER_OR_EQUAL,
        Operator.LESS,
        Operator.LESS_OR_EQUAL,
        Operator.BETWEEN,
        Operator.YEARS_AGO,
        Operator.IN_LIST,
        Operator.NOT_IN_LIST,
        Operator.IS_NULL,
        Operator.IS_NOT_NULL,
    },
    "date": {
        Operator.EQUALS,
        Operator.BEFORE,
        Operator.AFTER,
        Operator.WITHIN_DAYS,
        Operator.BETWEEN,
        Operator.IS_NULL,
        Operator.IS_NOT_NULL,
        Operator.NEVER,
    },
    "boolean": {
        Operator.IS_TRUE,
        Operator.IS_FALSE,
        Operator.IS_NULL,
        Operator.IS_NOT_NULL,
    },
    "similarity": {
        Operator.TOP_N,
    },
}


@dataclass
class Condition:
    """A single rule condition."""

    field: str
    operator: Operator
    value: Any


@dataclass
class ConditionGroup:
    """A group of conditions with AND/OR logic."""

    match: Literal["all", "any"]
    conditions: list[Union[Condition, "ConditionGroup"]]


class RuleEngineError(Exception):
    """Exception raised for rule parsing/validation errors."""

    pass


class RuleEngine:
    """
    Engine for parsing, validating, and compiling smart playlist rules.

    The rule engine supports:
    - Nested condition groups with AND/OR logic
    - Multiple field types (string, number, date, boolean)
    - Join-based fields (artist, genre)
    - Computed fields from play statistics
    - External fields (likes/dislikes from frontend)
    """

    # Field definitions with type, source table, and column
    FIELD_DEFINITIONS: dict[str, dict[str, Any]] = {
        # Basic song metadata
        "title": {"type": "string", "table": "s", "column": "title"},
        "album": {"type": "string", "table": "s", "column": "album"},
        "release_year": {"type": "number", "table": "s", "column": "release_year"},
        "duration_sec": {"type": "number", "table": "s", "column": "duration_sec"},
        "track_number": {"type": "number", "table": "s", "column": "track_number"},
        "added_at": {"type": "date", "table": "s", "column": "created_at"},
        "verified": {"type": "boolean", "table": "s", "column": "verified"},
        # Joined fields
        "artist": {
            "type": "string",
            "table": "metadata.artists",
            "column": "name",
            "join": "metadata.song_artists",
        },
        "genre": {
            "type": "string",
            "table": "metadata.genres",
            "column": "name",
            "join": "metadata.song_genres",
        },
        # Computed play stats fields
        "play_count": {
            "type": "number",
            "table": "ps",
            "column": "play_count",
            "computed": True,
        },
        "last_played": {
            "type": "date",
            "table": "ps",
            "column": "last_played",
            "computed": True,
        },
        "skip_count": {
            "type": "number",
            "table": "ps",
            "column": "skip_count",
            "computed": True,
        },
        "completion_rate": {
            "type": "number",
            "table": "ps",
            "column": "avg_completion",
            "computed": True,
        },
        "last_week_plays": {
            "type": "number",
            "table": "ps",
            "column": "last_week_plays",
            "computed": True,
        },
        "trending": {
            "type": "boolean",
            "table": "ps",
            "column": "trending",
            "computed": True,
        },
        "declining": {
            "type": "boolean",
            "table": "ps",
            "column": "declining",
            "computed": True,
        },
        # External fields (handled specially)
        "is_liked": {"type": "boolean", "external": True},
        "is_disliked": {"type": "boolean", "external": True},
        # Embedding check
        "has_embedding": {
            "type": "boolean",
            "table": "embeddings.vggish_embeddings",
            "column": "sha_id",
            "check_exists": True,
        },
        # Similarity-based rules
        "similar_to": {"type": "similarity", "external": True},
        # Audio features (optional)
        "bpm": {"type": "number", "table": "af", "column": "bpm", "optional": True},
        "energy": {"type": "number", "table": "af", "column": "energy", "optional": True},
        "key": {"type": "string", "table": "af", "column": "key", "optional": True},
        "key_mode": {"type": "string", "table": "af", "column": "key_mode", "optional": True},
        "danceability": {
            "type": "number",
            "table": "af",
            "column": "danceability",
            "optional": True,
        },
        "acousticness": {
            "type": "number",
            "table": "af",
            "column": "acousticness",
            "optional": True,
        },
        "instrumentalness": {
            "type": "number",
            "table": "af",
            "column": "instrumentalness",
            "optional": True,
        },
        "mood": {"type": "string", "table": "af", "column": "mood_primary", "optional": True},
        "key_camelot": {"type": "string", "table": "af", "column": "key_camelot", "optional": True},
    }

    def parse(self, rules_json: dict) -> ConditionGroup:
        """
        Parse JSON rules into a typed AST.

        Args:
            rules_json: The raw JSON rule definition

        Returns:
            ConditionGroup representing the parsed rules

        Raises:
            RuleEngineError: If rules are invalid
        """
        if not isinstance(rules_json, dict):
            raise RuleEngineError("Rules must be a JSON object")

        version = rules_json.get("version", 1)
        if version != 1:
            raise RuleEngineError(f"Unsupported rules version: {version}")

        return self._parse_group(rules_json, depth=0)

    def _parse_group(self, group: dict, depth: int) -> ConditionGroup:
        """Parse a condition group (AND/OR)."""
        if depth > MAX_NESTING_DEPTH:
            raise RuleEngineError(
                f"Maximum nesting depth ({MAX_NESTING_DEPTH}) exceeded"
            )

        match = group.get("match", "all")
        if match not in ("all", "any"):
            raise RuleEngineError(f"Invalid match type: {match}. Must be 'all' or 'any'")

        raw_conditions = group.get("conditions", [])
        if not isinstance(raw_conditions, list):
            raise RuleEngineError("Conditions must be a list")

        if len(raw_conditions) > MAX_CONDITIONS:
            raise RuleEngineError(
                f"Too many conditions ({len(raw_conditions)}). Maximum is {MAX_CONDITIONS}"
            )

        conditions: list[Condition | ConditionGroup] = []
        for cond in raw_conditions:
            if not isinstance(cond, dict):
                raise RuleEngineError("Each condition must be an object")

            if "conditions" in cond:
                # Nested group
                conditions.append(self._parse_group(cond, depth + 1))
            else:
                # Simple condition
                conditions.append(self._parse_condition(cond))

        return ConditionGroup(match=match, conditions=conditions)

    def _parse_condition(self, cond: dict) -> Condition:
        """Parse a single condition."""
        field = cond.get("field")
        if not field:
            raise RuleEngineError("Condition missing 'field'")

        if field not in self.FIELD_DEFINITIONS:
            raise RuleEngineError(f"Unknown field: {field}")

        operator_str = cond.get("operator")
        if not operator_str:
            raise RuleEngineError(f"Condition for '{field}' missing 'operator'")

        try:
            operator = Operator(operator_str)
        except ValueError:
            raise RuleEngineError(f"Unknown operator: {operator_str}")

        value = cond.get("value")

        # Validate operator for field type
        field_def = self.FIELD_DEFINITIONS[field]
        self._validate_operator(field, field_def["type"], operator)
        self._validate_value(field_def["type"], operator, value)

        return Condition(field=field, operator=operator, value=value)

    def _validate_operator(self, field: str, field_type: str, operator: Operator) -> None:
        """Validate that the operator is valid for the field type."""
        valid_operators = OPERATORS_BY_TYPE.get(field_type, set())
        if operator not in valid_operators:
            raise RuleEngineError(
                f"Operator '{operator.value}' is not valid for field '{field}' "
                f"(type: {field_type})"
            )

    def _validate_value(self, field_type: str, operator: Operator, value: Any) -> None:
        """Validate that the value is appropriate for the operator."""
        # Operators that don't require values
        if operator in {
            Operator.IS_TRUE,
            Operator.IS_FALSE,
            Operator.IS_NULL,
            Operator.IS_NOT_NULL,
            Operator.NEVER,
        }:
            return

        if value is None:
            raise RuleEngineError(f"Operator '{operator.value}' requires a value")

        # Between requires array of 2
        if operator == Operator.BETWEEN:
            if not isinstance(value, list) or len(value) != 2:
                raise RuleEngineError(
                    f"Operator 'between' requires an array of exactly 2 values"
                )

        # List operators require array
        if operator in {Operator.IN_LIST, Operator.NOT_IN_LIST}:
            if not isinstance(value, list):
                raise RuleEngineError(
                    f"Operator '{operator.value}' requires an array of values"
                )
            if len(value) == 0:
                raise RuleEngineError(
                    f"Operator '{operator.value}' requires at least one value"
                )

        if operator == Operator.SAME_AS:
            if not isinstance(value, str):
                raise RuleEngineError(
                    "Operator 'same_as' requires a playlist reference string"
                )

        if operator == Operator.YEARS_AGO:
            if not isinstance(value, (int, float)):
                raise RuleEngineError(
                    "Operator 'years_ago' requires a numeric value"
                )

        if operator == Operator.TOP_N:
            if not isinstance(value, dict):
                raise RuleEngineError(
                    "Operator 'top_n' requires an object with sha_id and count"
                )
            if not value.get("sha_id"):
                raise RuleEngineError("Operator 'top_n' requires a sha_id")
            count_value = value.get("count", 0)
            if not isinstance(count_value, (int, float)):
                raise RuleEngineError("Operator 'top_n' requires a numeric count")
            if int(count_value) <= 0:
                raise RuleEngineError("Operator 'top_n' requires a positive count")

        # Numeric fields need numeric values
        if field_type == "number" and operator not in {
            Operator.IN_LIST,
            Operator.NOT_IN_LIST,
            Operator.BETWEEN,
            Operator.YEARS_AGO,
        }:
            if not isinstance(value, (int, float)):
                raise RuleEngineError(
                    f"Field of type 'number' requires a numeric value, got: {type(value).__name__}"
                )

        # Regex validation
        if operator == Operator.REGEX:
            try:
                re.compile(value)
            except re.error as e:
                raise RuleEngineError(f"Invalid regex pattern: {e}")

    def validate(self, rules: ConditionGroup) -> list[str]:
        """
        Validate parsed rules and return list of warnings.

        Args:
            rules: Parsed ConditionGroup

        Returns:
            List of warning messages (empty if no issues)
        """
        warnings = []
        self._validate_group(rules, warnings)

        score, factors = self._estimate_complexity(rules)
        if score >= 18:
            details = ", ".join(sorted(set(factors))) if factors else "multiple conditions"
            warnings.append(
                f"Rule complexity score {score} may impact performance ({details})"
            )

        return warnings

    def _validate_group(self, group: ConditionGroup, warnings: list[str]) -> None:
        """Validate a condition group recursively."""
        if not group.conditions:
            warnings.append("Empty condition group will match all songs")

        for cond in group.conditions:
            if isinstance(cond, ConditionGroup):
                self._validate_group(cond, warnings)
            else:
                self._validate_condition_warnings(cond, warnings)

    def _validate_condition_warnings(self, cond: Condition, warnings: list[str]) -> None:
        """Check for potential issues in a condition."""
        field_def = self.FIELD_DEFINITIONS[cond.field]

        # Warn about optional/future fields
        if field_def.get("optional"):
            warnings.append(
                f"Field '{cond.field}' may not be available for all songs"
            )

        # Warn about external fields
        if field_def.get("external"):
            warnings.append(
                f"Field '{cond.field}' requires user preferences to be passed"
            )

        if cond.operator == Operator.SAME_AS:
            warnings.append(
                f"Field '{cond.field}' references another playlist and may be expensive"
            )
        if cond.operator == Operator.TOP_N:
            warnings.append(
                "Similarity-based rules require embeddings and additional queries"
            )

    def _estimate_complexity(self, group: ConditionGroup) -> tuple[int, list[str]]:
        """Estimate rule complexity score and contributing factors."""
        score = 0
        factors: list[str] = []

        for cond in group.conditions:
            if isinstance(cond, ConditionGroup):
                score += 1
                factors.append("nested group")
                nested_score, nested_factors = self._estimate_complexity(cond)
                score += nested_score
                factors.extend(nested_factors)
                continue

            score += 1
            field_def = self.FIELD_DEFINITIONS[cond.field]
            if cond.operator == Operator.REGEX:
                score += 5
                factors.append("regex")
            if cond.operator in {Operator.CONTAINS, Operator.NOT_CONTAINS}:
                score += 2
                factors.append("contains")
            if cond.operator in {Operator.SAME_AS, Operator.TOP_N}:
                score += 4
                factors.append("cross-playlist match")
            if field_def.get("join"):
                score += 2
                factors.append("joins")
            if field_def.get("computed"):
                score += 1
                factors.append("computed fields")
            if field_def.get("external"):
                score += 1
                factors.append("external preferences")

        return score, factors

    def compile_to_sql(
        self,
        rules: ConditionGroup,
        liked_song_ids: set[str] | None = None,
        disliked_song_ids: set[str] | None = None,
        same_as_values: dict[tuple[str, str], list[str]] | None = None,
        similarity_values: dict[tuple[str, int], list[str]] | None = None,
    ) -> tuple[str, list[Any]]:
        """
        Compile rules to SQL WHERE clause and parameters.

        Args:
            rules: Parsed ConditionGroup
            liked_song_ids: Set of liked song IDs (for is_liked field)
            disliked_song_ids: Set of disliked song IDs (for is_disliked field)

        Returns:
            Tuple of (WHERE clause SQL, list of parameters)
        """
        context = {
            "params": [],
            "liked_song_ids": liked_song_ids or set(),
            "disliked_song_ids": disliked_song_ids or set(),
            "same_as_values": same_as_values or {},
            "similarity_values": similarity_values or {},
        }

        where_clause = self._compile_group(rules, context)

        if not where_clause:
            where_clause = "TRUE"

        return where_clause, context["params"]

    def _compile_group(self, group: ConditionGroup, context: dict) -> str:
        """Compile a condition group to SQL."""
        if not group.conditions:
            return "TRUE"

        connector = " AND " if group.match == "all" else " OR "
        parts = []

        for cond in group.conditions:
            if isinstance(cond, ConditionGroup):
                nested = self._compile_group(cond, context)
                if nested and nested != "TRUE":
                    parts.append(f"({nested})")
            else:
                sql = self._compile_condition(cond, context)
                if sql:
                    parts.append(sql)

        if not parts:
            return "TRUE"

        return connector.join(parts)

    def _compile_condition(self, cond: Condition, context: dict) -> str:
        """Compile a single condition to SQL."""
        field_def = self.FIELD_DEFINITIONS[cond.field]

        if cond.operator == Operator.SAME_AS:
            return self._compile_same_as_condition(cond, context)

        if cond.field == "similar_to":
            return self._compile_similarity_condition(cond, context)

        # Handle external fields (likes/dislikes)
        if field_def.get("external"):
            return self._compile_external_condition(cond, context)

        # Handle check_exists fields (embeddings)
        if field_def.get("check_exists"):
            return self._compile_exists_condition(cond, field_def, context)

        # Handle joined fields (artist)
        if "join" in field_def:
            return self._compile_join_condition(cond, field_def, context)

        # Standard field
        column = f"{field_def['table']}.{field_def['column']}"
        return self._compile_operator(column, cond.operator, cond.value, context)

    def _compile_external_condition(self, cond: Condition, context: dict) -> str:
        """Compile external field conditions (likes/dislikes)."""
        if cond.field == "is_liked":
            liked_ids = context["liked_song_ids"]
            if not liked_ids:
                # No liked songs, condition is always false
                if cond.operator == Operator.IS_TRUE:
                    return "FALSE"
                else:
                    return "TRUE"

            if cond.operator == Operator.IS_TRUE:
                placeholders = ", ".join(
                    f"%s" for _ in liked_ids
                )
                context["params"].extend(liked_ids)
                return f"s.sha_id IN ({placeholders})"
            else:  # IS_FALSE
                placeholders = ", ".join(
                    f"%s" for _ in liked_ids
                )
                context["params"].extend(liked_ids)
                return f"s.sha_id NOT IN ({placeholders})"

        elif cond.field == "is_disliked":
            disliked_ids = context["disliked_song_ids"]
            if not disliked_ids:
                if cond.operator == Operator.IS_TRUE:
                    return "FALSE"
                else:
                    return "TRUE"

            if cond.operator == Operator.IS_TRUE:
                placeholders = ", ".join(
                    f"%s" for _ in disliked_ids
                )
                context["params"].extend(disliked_ids)
                return f"s.sha_id IN ({placeholders})"
            else:  # IS_FALSE
                placeholders = ", ".join(
                    f"%s" for _ in disliked_ids
                )
                context["params"].extend(disliked_ids)
                return f"s.sha_id NOT IN ({placeholders})"

        return "TRUE"

    def _compile_same_as_condition(self, cond: Condition, context: dict) -> str:
        """Compile playlist reference conditions."""
        playlist_id = self._parse_playlist_reference(cond.value)
        if not playlist_id:
            raise RuleEngineError("same_as requires a playlist reference like 'playlist:<id>'")

        values = context["same_as_values"].get((cond.field, playlist_id), [])
        if not values:
            return "FALSE"

        if cond.field == "artist":
            operator_sql = self._compile_operator(
                "a.name", Operator.IN_LIST, values, context
            )
            return f"""EXISTS (
                SELECT 1 FROM metadata.song_artists sa
                JOIN metadata.artists a ON a.artist_id = sa.artist_id
                WHERE sa.sha_id = s.sha_id AND {operator_sql}
            )"""

        if cond.field == "genre":
            operator_sql = self._compile_operator(
                "g.name", Operator.IN_LIST, values, context
            )
            return f"""EXISTS (
                SELECT 1 FROM metadata.song_genres sg
                JOIN metadata.genres g ON g.genre_id = sg.genre_id
                WHERE sg.sha_id = s.sha_id AND {operator_sql}
            )"""

        field_def = self.FIELD_DEFINITIONS[cond.field]
        column = f"{field_def['table']}.{field_def['column']}"
        return self._compile_operator(column, Operator.IN_LIST, values, context)

    def _compile_similarity_condition(self, cond: Condition, context: dict) -> str:
        """Compile similarity-based conditions."""
        value = cond.value or {}
        sha_id = value.get("sha_id")
        count = int(value.get("count", 0) or 0)

        if not sha_id or count <= 0:
            return "FALSE"

        values = context["similarity_values"].get((sha_id, count), [])
        if not values:
            return "FALSE"

        placeholders = ", ".join("%s" for _ in values)
        context["params"].extend(values)
        return f"s.sha_id IN ({placeholders})"

    def _parse_playlist_reference(self, value: str | None) -> str | None:
        """Extract playlist ID from reference string."""
        if not value:
            return None
        if ":" in value:
            prefix, playlist_id = value.split(":", 1)
            if prefix in {"playlist", "smart"} and playlist_id:
                return playlist_id
            return None
        return value

    def _compile_exists_condition(
        self, cond: Condition, field_def: dict, context: dict
    ) -> str:
        """Compile check_exists conditions (e.g., has_embedding)."""
        table = field_def["table"]
        column = field_def["column"]

        if cond.operator == Operator.IS_TRUE:
            return f"EXISTS (SELECT 1 FROM {table} WHERE {table}.{column} = s.sha_id)"
        else:  # IS_FALSE
            return f"NOT EXISTS (SELECT 1 FROM {table} WHERE {table}.{column} = s.sha_id)"

    def _compile_join_condition(
        self, cond: Condition, field_def: dict, context: dict
    ) -> str:
        """Compile join-based conditions (artist, genre)."""
        # For artist field, we use a subquery to check if any matching artist exists
        if cond.field == "artist":
            operator_sql = self._compile_operator(
                "a.name", cond.operator, cond.value, context
            )
            return f"""EXISTS (
                SELECT 1 FROM metadata.song_artists sa
                JOIN metadata.artists a ON a.artist_id = sa.artist_id
                WHERE sa.sha_id = s.sha_id AND {operator_sql}
            )"""

        if cond.field == "genre":
            operator_sql = self._compile_operator(
                "g.name", cond.operator, cond.value, context
            )
            return f"""EXISTS (
                SELECT 1 FROM metadata.song_genres sg
                JOIN metadata.genres g ON g.genre_id = sg.genre_id
                WHERE sg.sha_id = s.sha_id AND {operator_sql}
            )"""

        # Default join handling
        return "TRUE"

    def _compile_operator(
        self, column: str, op: Operator, value: Any, context: dict
    ) -> str:
        """Generate SQL for an operator."""
        params = context["params"]

        match op:
            case Operator.EQUALS:
                params.append(value)
                return f"{column} = %s"

            case Operator.NOT_EQUALS:
                params.append(value)
                return f"{column} != %s"

            case Operator.CONTAINS:
                params.append(f"%{value}%")
                return f"{column} ILIKE %s"

            case Operator.NOT_CONTAINS:
                params.append(f"%{value}%")
                return f"{column} NOT ILIKE %s"

            case Operator.STARTS_WITH:
                params.append(f"{value}%")
                return f"{column} ILIKE %s"

            case Operator.ENDS_WITH:
                params.append(f"%{value}")
                return f"{column} ILIKE %s"

            case Operator.REGEX:
                params.append(value)
                return f"{column} ~ %s"

            case Operator.GREATER:
                params.append(value)
                return f"{column} > %s"

            case Operator.GREATER_OR_EQUAL:
                params.append(value)
                return f"{column} >= %s"

            case Operator.LESS:
                params.append(value)
                return f"{column} < %s"

            case Operator.LESS_OR_EQUAL:
                params.append(value)
                return f"{column} <= %s"

            case Operator.BETWEEN:
                params.extend(value)
                return f"{column} BETWEEN %s AND %s"

            case Operator.YEARS_AGO:
                params.append(int(value))
                return f"{column} <= EXTRACT(YEAR FROM NOW()) - %s"

            case Operator.IN_LIST:
                placeholders = ", ".join("%s" for _ in value)
                params.extend(value)
                return f"{column} IN ({placeholders})"

            case Operator.NOT_IN_LIST:
                placeholders = ", ".join("%s" for _ in value)
                params.extend(value)
                return f"{column} NOT IN ({placeholders})"

            case Operator.IS_TRUE:
                return f"{column} = TRUE"

            case Operator.IS_FALSE:
                return f"{column} = FALSE"

            case Operator.IS_NULL:
                return f"{column} IS NULL"

            case Operator.IS_NOT_NULL:
                return f"{column} IS NOT NULL"

            case Operator.BEFORE:
                # Handle relative dates like "-90 days"
                if isinstance(value, str) and value.startswith("-"):
                    days = int(value.replace("-", "").replace(" days", "").strip())
                    return f"{column} < NOW() - INTERVAL '{days} days'"
                params.append(value)
                return f"{column} < %s"

            case Operator.AFTER:
                if isinstance(value, str) and value.startswith("-"):
                    days = int(value.replace("-", "").replace(" days", "").strip())
                    return f"{column} > NOW() - INTERVAL '{days} days'"
                params.append(value)
                return f"{column} > %s"

            case Operator.WITHIN_DAYS:
                days = int(value)
                return f"{column} > NOW() - INTERVAL '{days} days'"

            case Operator.NEVER:
                return f"{column} IS NULL"

            case _:
                raise RuleEngineError(f"Unhandled operator: {op}")

    def explain(self, rules: ConditionGroup) -> str:
        """
        Generate a human-readable explanation of the rules.

        Args:
            rules: Parsed ConditionGroup

        Returns:
            Human-readable string describing the rules
        """
        return self._explain_group(rules, indent=0)

    def _explain_group(self, group: ConditionGroup, indent: int) -> str:
        """Generate explanation for a condition group."""
        prefix = "  " * indent
        connector = "ALL" if group.match == "all" else "ANY"

        if not group.conditions:
            return f"{prefix}Match all songs"

        if len(group.conditions) == 1:
            cond = group.conditions[0]
            if isinstance(cond, ConditionGroup):
                return self._explain_group(cond, indent)
            else:
                return f"{prefix}{self._explain_condition(cond)}"

        lines = [f"{prefix}Match {connector} of the following:"]
        for cond in group.conditions:
            if isinstance(cond, ConditionGroup):
                lines.append(self._explain_group(cond, indent + 1))
            else:
                lines.append(f"{prefix}  - {self._explain_condition(cond)}")

        return "\n".join(lines)

    def _explain_condition(self, cond: Condition) -> str:
        """Generate explanation for a single condition."""
        field = cond.field.replace("_", " ").title()
        value = cond.value

        match cond.operator:
            case Operator.EQUALS:
                return f"{field} is '{value}'"
            case Operator.NOT_EQUALS:
                return f"{field} is not '{value}'"
            case Operator.CONTAINS:
                return f"{field} contains '{value}'"
            case Operator.NOT_CONTAINS:
                return f"{field} does not contain '{value}'"
            case Operator.STARTS_WITH:
                return f"{field} starts with '{value}'"
            case Operator.ENDS_WITH:
                return f"{field} ends with '{value}'"
            case Operator.REGEX:
                return f"{field} matches pattern '{value}'"
            case Operator.SAME_AS:
                return f"{field} matches values from {value}"
            case Operator.GREATER:
                return f"{field} is greater than {value}"
            case Operator.GREATER_OR_EQUAL:
                return f"{field} is at least {value}"
            case Operator.LESS:
                return f"{field} is less than {value}"
            case Operator.LESS_OR_EQUAL:
                return f"{field} is at most {value}"
            case Operator.BETWEEN:
                return f"{field} is between {value[0]} and {value[1]}"
            case Operator.YEARS_AGO:
                return f"{field} is at least {value} years ago"
            case Operator.IN_LIST:
                items = ", ".join(f"'{v}'" for v in value)
                return f"{field} is one of: {items}"
            case Operator.NOT_IN_LIST:
                items = ", ".join(f"'{v}'" for v in value)
                return f"{field} is not: {items}"
            case Operator.IS_TRUE:
                return f"{field} is true"
            case Operator.IS_FALSE:
                return f"{field} is false"
            case Operator.IS_NULL:
                return f"{field} is not set"
            case Operator.IS_NOT_NULL:
                return f"{field} is set"
            case Operator.BEFORE:
                return f"{field} is before {value}"
            case Operator.AFTER:
                return f"{field} is after {value}"
            case Operator.WITHIN_DAYS:
                return f"{field} is within the last {value} days"
            case Operator.NEVER:
                return f"{field} has never occurred"
            case Operator.TOP_N:
                if isinstance(value, dict):
                    count = value.get("count")
                    return f"{field} matches top {count} similar songs"
                return f"{field} matches top similar songs"
            case _:
                return f"{field} {cond.operator.value} {value}"


# Singleton instance
_engine: RuleEngine | None = None


def get_rule_engine() -> RuleEngine:
    """Get the singleton RuleEngine instance."""
    global _engine
    if _engine is None:
        _engine = RuleEngine()
    return _engine
