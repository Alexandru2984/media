use axum::http::StatusCode;
use std::collections::HashMap;

pub(crate) const MAXIMUM_PAGE_SIZE: i64 = 50;
pub(crate) const MAXIMUM_STANDARD_OFFSET: i64 = 10_000;

fn parse_parameter(
    params: &HashMap<String, String>,
    name: &'static str,
    default: i64,
    minimum: i64,
    maximum: i64,
) -> Result<i64, StatusCode> {
    let Some(raw_value) = params.get(name) else {
        return Ok(default);
    };
    let value = raw_value
        .parse::<i64>()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    if !(minimum..=maximum).contains(&value) {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(value)
}

pub(crate) fn bounded_pagination(
    params: &HashMap<String, String>,
    default_limit: i64,
    maximum_limit: i64,
    maximum_offset: i64,
) -> Result<(i64, i64), StatusCode> {
    if !(1..=maximum_limit).contains(&default_limit) || maximum_limit < 1 || maximum_offset < 0 {
        tracing::error!(
            default_limit,
            maximum_limit,
            maximum_offset,
            "invalid server pagination bounds"
        );
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    let limit = parse_parameter(params, "limit", default_limit, 1, maximum_limit)?;
    let offset = parse_parameter(params, "offset", 0, 0, maximum_offset)?;
    Ok((limit, offset))
}

#[cfg(test)]
mod tests {
    use super::{bounded_pagination, MAXIMUM_PAGE_SIZE};
    use axum::http::StatusCode;
    use std::collections::HashMap;

    fn params(values: &[(&str, &str)]) -> HashMap<String, String> {
        values
            .iter()
            .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
            .collect()
    }

    #[test]
    fn applies_defaults_and_accepts_exact_boundaries() {
        assert_eq!(
            bounded_pagination(&HashMap::new(), 20, 50, 500),
            Ok((20, 0))
        );
        assert_eq!(
            bounded_pagination(
                &params(&[("limit", "50"), ("offset", "500")]),
                20,
                MAXIMUM_PAGE_SIZE,
                500,
            ),
            Ok((50, 500))
        );
    }

    #[test]
    fn rejects_malformed_negative_or_zero_values() {
        for values in [
            vec![("limit", "nope")],
            vec![("limit", "0")],
            vec![("limit", "-1")],
            vec![("offset", "-1")],
            vec![("offset", "1.5")],
        ] {
            assert_eq!(
                bounded_pagination(&params(&values), 20, 50, 500),
                Err(StatusCode::BAD_REQUEST)
            );
        }
    }

    #[test]
    fn rejects_values_above_collection_budgets() {
        assert_eq!(
            bounded_pagination(&params(&[("limit", "51")]), 20, 50, 500),
            Err(StatusCode::BAD_REQUEST)
        );
        assert_eq!(
            bounded_pagination(&params(&[("offset", "501")]), 20, 50, 500),
            Err(StatusCode::BAD_REQUEST)
        );
    }

    #[test]
    fn fails_closed_for_invalid_server_configuration() {
        assert_eq!(
            bounded_pagination(&HashMap::new(), 0, 50, 500),
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        );
        assert_eq!(
            bounded_pagination(&HashMap::new(), 20, 0, 500),
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        );
        assert_eq!(
            bounded_pagination(&HashMap::new(), 20, 50, -1),
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        );
    }
}
