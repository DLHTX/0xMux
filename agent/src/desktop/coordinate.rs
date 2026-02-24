use crate::types::{Point, Rect};

/// Converts physical pixel coordinates to logical coordinates
pub fn physical_to_logical(x: f32, y: f32, scale_factor: f32) -> Point {
    Point {
        x: (x / scale_factor) as i32,
        y: (y / scale_factor) as i32,
    }
}

/// Converts logical coordinates to physical pixel coordinates
pub fn logical_to_physical(x: i32, y: i32, scale_factor: f32) -> (u32, u32) {
    (
        (x as f32 * scale_factor) as u32,
        (y as f32 * scale_factor) as u32,
    )
}

/// Returns the center point of a bounding rect (already in logical coordinates)
pub fn element_center(bounds: &Rect) -> Point {
    Point {
        x: (bounds.x + bounds.width / 2.0) as i32,
        y: (bounds.y + bounds.height / 2.0) as i32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_physical_to_logical_retina() {
        let p = physical_to_logical(800.0, 600.0, 2.0);
        assert_eq!(p.x, 400);
        assert_eq!(p.y, 300);
    }

    #[test]
    fn test_physical_to_logical_standard() {
        let p = physical_to_logical(800.0, 600.0, 1.0);
        assert_eq!(p.x, 800);
        assert_eq!(p.y, 600);
    }

    #[test]
    fn test_logical_to_physical() {
        let (px, py) = logical_to_physical(400, 300, 2.0);
        assert_eq!(px, 800);
        assert_eq!(py, 600);
    }

    #[test]
    fn test_element_center() {
        let bounds = Rect {
            x: 100.0,
            y: 200.0,
            width: 60.0,
            height: 40.0,
        };
        let c = element_center(&bounds);
        assert_eq!(c.x, 130);
        assert_eq!(c.y, 220);
    }
}
